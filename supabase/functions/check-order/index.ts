import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const reference = url.searchParams.get("reference");
    const promoCode = url.searchParams.get("promo");
    const referralCode = url.searchParams.get("referral");
    const eventId = url.searchParams.get("event_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // 1. PROMO CODE VALIDATION ENDPOINT
    // =========================================================================
    if (promoCode) {
      const cleanCode = promoCode.trim().toUpperCase();
      const { data: promo, error: promoErr } = await supabase
        .from("promo_codes")
        .select("id, code, discount_type, discount_value, max_uses, current_uses, min_order_amount, expires_at, is_active, event_id")
        .eq("code", cleanCode)
        .eq("is_active", true)
        .maybeSingle();

      if (promoErr || !promo) {
        return new Response(
          JSON.stringify({ valid: false, message: "Invalid promo code. Code does not exist or has been deactivated." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check Expiration
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ valid: false, message: "This promo code has expired." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check Usage Limit
      if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
        return new Response(
          JSON.stringify({ valid: false, message: "This promo code has reached its maximum usage limit." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check Event Match
      if (promo.event_id && eventId && promo.event_id !== eventId) {
        return new Response(
          JSON.stringify({ valid: false, message: "This promo code is not applicable to the selected event." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          code: promo.code,
          discount_type: promo.discount_type,
          discount_value: Number(promo.discount_value),
          min_order_amount: Number(promo.min_order_amount) || 0,
          message: promo.discount_type === "percentage" 
            ? `${promo.discount_value}% discount applied!` 
            : `KSh ${Number(promo.discount_value).toLocaleString()} discount applied!`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // 2. REFERRAL CODE VALIDATION ENDPOINT
    // =========================================================================
    if (referralCode) {
      const cleanRef = referralCode.trim().toUpperCase();

      // Referral code MUST correspond to a verified, paid order
      const { data: refOrder, error: refErr } = await supabase
        .from("orders")
        .select("id, order_reference, customer_name, status")
        .eq("order_reference", cleanRef)
        .eq("status", "paid")
        .maybeSingle();

      if (refErr || !refOrder) {
        return new Response(
          JSON.stringify({
            valid: false,
            message: "Referral code not found. The code must belong to a verified, paid booking."
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          valid: true,
          code: refOrder.order_reference,
          discount_amount: 100.00,
          referrer_name: refOrder.customer_name,
          message: `Referral code verified! KSh 100 discount applied.`
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // 3. ORDER STATUS POLLING (FOR REAL-TIME CONFIRMATION)
    // =========================================================================
    if (!reference) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing order reference or query parameter." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_reference,
        status,
        provider_reference,
        total_amount,
        quantity,
        customer_name,
        customer_email,
        phone_number,
        selected_seats,
        paid_at,
        expires_at,
        failure_reason,
        events (
          id,
          name,
          venue,
          event_date,
          event_time,
          poster_url,
          seating_model
        ),
        ticket_categories (
          id,
          name,
          price,
          attendees_per_unit
        )
      `)
      .eq("order_reference", reference)
      .single();

    if (error || !order) {
      return new Response(
        JSON.stringify({ success: false, message: "Order not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if pending order has expired (> 15 mins)
    let currentStatus = order.status;
    if (currentStatus === "pending" && order.expires_at && new Date(order.expires_at) < new Date()) {
      currentStatus = "expired";
      await supabase.from("orders").update({ status: "expired" }).eq("id", order.id);

      // Restore category remaining quantity
      if (order.ticket_categories?.id) {
        const { data: cat } = await supabase
          .from("ticket_categories")
          .select("remaining_quantity, total_quantity")
          .eq("id", order.ticket_categories.id)
          .single();
        if (cat) {
          await supabase.from("ticket_categories").update({
            remaining_quantity: Math.min(cat.total_quantity, cat.remaining_quantity + order.quantity)
          }).eq("id", order.ticket_categories.id);
        }
      }

      // Release seats
      await supabase.from("seat_maps").update({
        status: "available",
        order_id: null,
        reserved_until: null
      }).eq("order_id", order.id);
    }

    const attendeesPerUnit = order.ticket_categories?.attendees_per_unit || 1;
    const totalAttendees = order.quantity * attendeesPerUnit;

    return new Response(
      JSON.stringify({
        success: true,
        order_reference: order.order_reference,
        status: currentStatus,
        provider_reference: order.provider_reference, // M-Pesa receipt
        total_amount: order.total_amount,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        phone_number: order.phone_number,
        quantity: order.quantity,
        total_attendees: totalAttendees,
        selected_seats: order.selected_seats,
        event_name: order.events?.name || "Event",
        event_venue: order.events?.venue || "Venue",
        event_date: order.events?.event_date || "",
        event_time: order.events?.event_time || "",
        ticket_category_name: order.ticket_categories?.name || "Ticket",
        referral_code: order.order_reference,
        message: order.failure_reason || null,
        paid_at: order.paid_at
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("check-order error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
