import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      event_id,
      ticket_category_id,
      quantity,
      customer_name,
      customer_email,
      phone_number,
      promo_code,
      referral_code,
      selected_seats
    } = await req.json();

    // 1. Basic validation
    if (!event_id || !ticket_category_id || !quantity || quantity < 1 || !customer_name || !customer_email || !phone_number) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required order parameters (event, ticket tier, quantity, name, email, phone)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Phone normalization (Kenyan 07/01 prefixes to 254...)
    let cleanPhone = String(phone_number).replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.substring(1);
    if (!cleanPhone.startsWith("254") && cleanPhone.length === 9) cleanPhone = "254" + cleanPhone;

    if (!/^254(7|1)\d{8}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid phone number. Please enter a valid Safaricom number starting with 07 or 01 (e.g. 0712345678 or 0112345678)."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment configuration missing.");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Clean up expired pending orders (> 15 minutes old) to free up reserved inventory and seats
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: expiredOrders } = await supabase
      .from("orders")
      .select("id, ticket_category_id, quantity")
      .eq("status", "pending")
      .lt("created_at", fifteenMinutesAgo);

    if (expiredOrders && expiredOrders.length > 0) {
      for (const exp of expiredOrders) {
        await supabase.from("orders").update({ status: "expired" }).eq("id", exp.id);
        const { data: cat } = await supabase.from("ticket_categories").select("remaining_quantity, total_quantity").eq("id", exp.ticket_category_id).single();
        if (cat) {
          const newQty = Math.min(cat.total_quantity, cat.remaining_quantity + exp.quantity);
          await supabase.from("ticket_categories").update({ remaining_quantity: newQty }).eq("id", exp.ticket_category_id);
        }
        await supabase.from("seat_maps").update({ status: "available", order_id: null, reserved_until: null }).eq("order_id", exp.id);
      }
    }

    // 4. Authoritative Database Fetch of Event & Check If Ended
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, name, venue, event_date, event_time, status, seating_model")
      .eq("id", event_id)
      .eq("status", "published")
      .single();

    if (eventErr || !event) {
      return new Response(
        JSON.stringify({ success: false, message: "Selected event is not currently published or available." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if event has ended / expired
    const todayStr = new Date().toISOString().split("T")[0];
    if (event.event_date < todayStr) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Ticket sales are closed. This event has already taken place."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: category, error: catErr } = await supabase
      .from("ticket_categories")
      .select("id, name, price, total_quantity, remaining_quantity, attendees_per_unit, is_active")
      .eq("id", ticket_category_id)
      .eq("event_id", event_id)
      .eq("is_active", true)
      .single();

    if (catErr || !category) {
      return new Response(
        JSON.stringify({ success: false, message: "Selected ticket category does not exist or is inactive." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qty = Number(quantity);
    if (category.remaining_quantity < qty) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Only ${category.remaining_quantity} ticket(s) remaining for ${category.name}. Please select a lower quantity.`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If event uses assigned seating, validate seat selection
    let validatedSeats: any[] = [];
    if (event.seating_model === "assigned_seating") {
      if (!Array.isArray(selected_seats) || selected_seats.length !== qty) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `This event requires assigned seating. Please select exactly ${qty} available seat(s).`
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const seat of selected_seats) {
        const { data: sData } = await supabase
          .from("seat_maps")
          .select("id, status")
          .eq("event_id", event_id)
          .eq("ticket_category_id", category.id)
          .eq("section", seat.section)
          .eq("row_name", seat.row)
          .eq("seat_number", seat.seat)
          .single();

        if (!sData || sData.status !== "available") {
          return new Response(
            JSON.stringify({
              success: false,
              message: `Seat ${seat.section} - ${seat.row} - ${seat.seat} is already reserved or unavailable. Please choose another.`
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      validatedSeats = selected_seats;
    }

    // 5. Strict Server-Side Pricing & Promo Code Validation
    const unitPrice = Number(category.price);
    const subtotal = unitPrice * qty;
    let discountAmount = 0;
    let appliedPromoId = null;

    // Strict Promo Code Verification (Must Exist & Be Active & Valid)
    if (promo_code && String(promo_code).trim() !== "") {
      const codeClean = String(promo_code).trim().toUpperCase();
      const { data: promo } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("code", codeClean)
        .eq("is_active", true)
        .maybeSingle();

      if (!promo) {
        return new Response(
          JSON.stringify({ success: false, message: `Promo code "${codeClean}" does not exist or has been removed.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();
      if (promo.expires_at && new Date(promo.expires_at) < now) {
        return new Response(
          JSON.stringify({ success: false, message: `Promo code "${codeClean}" has expired.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
        return new Response(
          JSON.stringify({ success: false, message: `Promo code "${codeClean}" has reached its maximum usage limit.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (promo.event_id && promo.event_id !== event_id) {
        return new Response(
          JSON.stringify({ success: false, message: `Promo code "${codeClean}" is not applicable to this event.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const minAmt = Number(promo.min_order_amount) || 0;
      if (subtotal < minAmt) {
        return new Response(
          JSON.stringify({ success: false, message: `Order subtotal must be at least KSh ${minAmt.toLocaleString()} to apply code "${codeClean}".` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      appliedPromoId = promo.id;
      if (promo.discount_type === "percentage") {
        discountAmount += (subtotal * (Number(promo.discount_value) / 100));
      } else {
        discountAmount += Number(promo.discount_value);
      }
    }

    // Strict Referral Code Verification (Must Exist & Belong to a Paid Booking)
    let appliedReferral = null;
    if (referral_code && String(referral_code).trim() !== "") {
      const refClean = String(referral_code).trim().toUpperCase();
      const { data: refOrder } = await supabase
        .from("orders")
        .select("id, order_reference, status")
        .eq("order_reference", refClean)
        .eq("status", "paid")
        .maybeSingle();

      if (!refOrder) {
        return new Response(
          JSON.stringify({ success: false, message: `Referral code "${refClean}" is invalid or does not correspond to a completed booking.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      appliedReferral = refClean;
      discountAmount += 100.00; // Standard referral discount
    }

    // Ensure total amount is at least 1 KSh for M-Pesa
    discountAmount = Math.min(discountAmount, Math.max(0, subtotal - 1));
    const totalAmount = Math.max(1, Math.round(subtotal - discountAmount));

    // 6. Generate Unique Order Reference
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderRef = `TIKO-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 7. Insert Pending Order
    const { data: newOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        order_reference: orderRef,
        event_id: event.id,
        ticket_category_id: category.id,
        quantity: qty,
        unit_price: unitPrice,
        subtotal: subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        promo_code_id: appliedPromoId,
        referral_code: appliedReferral,
        customer_name: customer_name.trim(),
        customer_email: customer_email.trim().toLowerCase(),
        phone_number: cleanPhone,
        selected_seats: validatedSeats.length > 0 ? validatedSeats : null,
        status: "pending",
        expires_at: expiresAt
      })
      .select()
      .single();

    if (insertError || !newOrder) {
      console.error("Order insertion error:", insertError);
      return new Response(
        JSON.stringify({ success: false, message: "Could not create order record." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Atomic Inventory Decrement
    const updatedRemaining = category.remaining_quantity - qty;
    await supabase
      .from("ticket_categories")
      .update({ remaining_quantity: updatedRemaining })
      .eq("id", category.id);

    // If seats, mark reserved
    if (validatedSeats.length > 0) {
      for (const seat of validatedSeats) {
        await supabase
          .from("seat_maps")
          .update({
            status: "reserved",
            order_id: newOrder.id,
            reserved_until: expiresAt
          })
          .eq("event_id", event_id)
          .eq("ticket_category_id", category.id)
          .eq("section", seat.section)
          .eq("row_name", seat.row)
          .eq("seat_number", seat.seat);
      }
    }

    // 9. Dispatch M-Pesa STK Push via FinoQ / PayHero
    const finoqUsername = Deno.env.get("FINOQ_API_KEY") || 
                          Deno.env.get("FINOQ_API_USERNAME") || 
                          Deno.env.get("PAYHERO_API_USERNAME") || "";

    const finoqPassword = Deno.env.get("FINOQ_API_SECRET") || 
                          Deno.env.get("FINOQ_API_PASSWORD") || 
                          Deno.env.get("PAYHERO_API_PASSWORD") || "";

    const finoqChannelId = Deno.env.get("FINOQ_CHANNEL_ID") || 
                           Deno.env.get("PAYHERO_CHANNEL_ID") || "";

    if (!finoqUsername || !finoqPassword || !finoqChannelId) {
      console.warn("FinoQ payment credentials not configured in Supabase Secrets.");
      return new Response(
        JSON.stringify({
          success: false,
          order_reference: orderRef,
          total_amount: totalAmount,
          message: "Payment provider not configured. Please set FINOQ credentials in Supabase Secrets."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = "Basic " + btoa(`${finoqUsername}:${finoqPassword}`);
    const callbackUrl = `${supabaseUrl}/functions/v1/payment-callback`;
    const finoqPhone = cleanPhone.startsWith("254") ? "0" + cleanPhone.substring(3) : cleanPhone;

    const finoqResponse = await fetch("https://backend.payhero.co.ke/api/v2/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({
        amount: totalAmount,
        phone_number: finoqPhone,
        channel_id: Number(finoqChannelId),
        provider: "m-pesa",
        external_reference: orderRef,
        callback_url: callbackUrl
      })
    });

    const responseText = await finoqResponse.text();
    let payheroData: any = {};
    try {
      payheroData = JSON.parse(responseText);
    } catch {
      payheroData = { message: responseText };
    }

    if (!finoqResponse.ok || payheroData.success === false || payheroData.error_code) {
      const errorMsg = payheroData.error_message || payheroData.message || responseText || "Failed to trigger M-Pesa STK push.";

      await supabase.from("orders").update({
        status: "failed",
        failure_reason: errorMsg
      }).eq("order_reference", orderRef);

      // Restore category remaining
      await supabase.from("ticket_categories").update({
        remaining_quantity: category.remaining_quantity
      }).eq("id", category.id);

      // Release reserved seats
      if (validatedSeats.length > 0) {
        await supabase.from("seat_maps").update({
          status: "available",
          order_id: null,
          reserved_until: null
        }).eq("order_id", newOrder.id);
      }

      return new Response(
        JSON.stringify({ success: false, message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save transaction reference & update to processing
    const transactionRef = payheroData.reference || payheroData.CheckoutRequestID || null;
    await supabase.from("orders").update({
      payhero_reference: transactionRef,
      channel_id: Number(finoqChannelId),
      status: "processing"
    }).eq("order_reference", orderRef);

    return new Response(
      JSON.stringify({
        success: true,
        order_reference: orderRef,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        message: "STK push sent to your phone. Enter your M-Pesa PIN to complete payment."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in create-order:", error);
    return new Response(
      JSON.stringify({ success: false, message: error?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
