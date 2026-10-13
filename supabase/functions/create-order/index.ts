import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticket_id, quantity, customer_name, customer_email, phone_number } = await req.json();

    // 1. Basic validation
    if (!ticket_id || !quantity || quantity < 1 || !customer_name || !customer_email || !phone_number) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required order parameters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number to 254...
    let cleanPhone = String(phone_number).replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.substring(1);
    if (!cleanPhone.startsWith("254") && cleanPhone.length === 9) cleanPhone = "254" + cleanPhone;

    if (!/^254(7|1)\d{8}$/.test(cleanPhone)) {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid Kenyan phone number format. Must start with 2547 or 2541." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment secrets are not configured.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Retrieve authoritative price directly from database
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .eq("is_active", true)
      .single();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ success: false, message: "Selected ticket is not available or does not exist." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const unitPrice = Number(ticket.offer_price);
    const totalAmount = unitPrice * Number(quantity);
    const totalAttendees = Number(ticket.attendees_per_unit) * Number(quantity);

    // 4. Generate unique order reference
    const orderRef = `TIKO-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Insert pending order record
    const { error: insertError } = await supabase.from("orders").insert({
      order_reference: orderRef,
      ticket_id: ticket.id,
      quantity: Number(quantity),
      total_attendees: totalAttendees,
      unit_price: unitPrice,
      total_amount: totalAmount,
      customer_name: customer_name.trim(),
      customer_email: customer_email.trim().toLowerCase(),
      phone_number: cleanPhone,
      status: "pending"
    });

    if (insertError) {
      console.error("Order insertion error:", insertError);
      return new Response(
        JSON.stringify({ success: false, message: "Could not create order in database." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Initiate PayHero / FinoQ STK Push
    const payheroUsername = Deno.env.get("PAYHERO_API_USERNAME");
    const payheroPassword = Deno.env.get("PAYHERO_API_PASSWORD");
    const payheroChannelId = Deno.env.get("PAYHERO_CHANNEL_ID");

    if (!payheroUsername || !payheroPassword || !payheroChannelId) {
      console.warn("PayHero credentials missing. Order saved as pending.");
      return new Response(
        JSON.stringify({
          success: true,
          order_reference: orderRef,
          total_amount: totalAmount,
          message: "Order created. Please configure PayHero credentials in Supabase to enable live STK Push."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = "Basic " + btoa(`${payheroUsername}:${payheroPassword}`);
    const callbackUrl = `${supabaseUrl}/functions/v1/payment-callback`;

    const payheroResponse = await fetch("https://backend.payhero.co.ke/api/v2/payments/initiate-stk-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({
        amount: totalAmount,
        phone_number: cleanPhone,
        channel_id: Number(payheroChannelId),
        provider: "mpesa",
        external_reference: orderRef,
        callback_url: callbackUrl
      })
    });

    const payheroData = await payheroResponse.json();

    if (!payheroResponse.ok || payheroData.success === false) {
      const errorMsg = payheroData.message || "Failed to initiate M-Pesa STK push via PayHero.";
      await supabase.from("orders").update({
        status: "failed",
        failure_reason: errorMsg
      }).eq("order_reference", orderRef);

      return new Response(
        JSON.stringify({ success: false, message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save PayHero transaction reference
    if (payheroData.reference) {
      await supabase.from("orders").update({
        payhero_reference: payheroData.reference,
        channel_id: Number(payheroChannelId),
        status: "processing"
      }).eq("order_reference", orderRef);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_reference: orderRef,
        payhero_reference: payheroData.reference || null,
        message: "STK Push sent to customer phone successfully."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Internal edge function error:", error);
    return new Response(
      JSON.stringify({ success: false, message: (error as Error).message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
