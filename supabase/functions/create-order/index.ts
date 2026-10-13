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
        JSON.stringify({ success: false, message: "Invalid phone number. Please enter a valid Safaricom number starting with 07 or 01 (e.g. 0712345678 or 0112345678)." }),
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

    // 6. Initiate FinoQ / PayHero STK Push
    const finoqUsername = Deno.env.get("FINOQ_API_KEY") || 
                          Deno.env.get("FINOQ_API_USERNAME") || 
                          Deno.env.get("PAYHERO_API_USERNAME") || "";

    const finoqPassword = Deno.env.get("FINOQ_API_SECRET") || 
                          Deno.env.get("FINOQ_API_PASSWORD") || 
                          Deno.env.get("PAYHERO_API_PASSWORD") || "";

    const finoqChannelId = Deno.env.get("FINOQ_CHANNEL_ID") || 
                           Deno.env.get("PAYHERO_CHANNEL_ID") || "";

    if (!finoqUsername || !finoqPassword || !finoqChannelId) {
      console.warn("FinoQ credentials missing in Supabase Secrets.");
      return new Response(
        JSON.stringify({
          success: false,
          order_reference: orderRef,
          total_amount: totalAmount,
          message: "Payment credentials not configured yet. Please add FINOQ_API_KEY, FINOQ_API_SECRET, and FINOQ_CHANNEL_ID to your Supabase Edge Function Secrets."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = "Basic " + btoa(`${finoqUsername}:${finoqPassword}`);
    const callbackUrl = `${supabaseUrl}/functions/v1/payment-callback`;

    // FinoQ API endpoint
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

    console.log("FinoQ API HTTP Status:", finoqResponse.status, "Response:", responseText);

    if (!finoqResponse.ok || payheroData.success === false || payheroData.error_code) {
      let errorMsg = payheroData.error_message || payheroData.message || payheroData.error || responseText || "Failed to initiate M-Pesa STK push via FinoQ.";
      
      if (errorMsg.includes("Merchant Account Inactive")) {
        errorMsg = "FinoQ Notice: Your Merchant Account on business.finoq.africa is currently Inactive. Please log in to business.finoq.africa to activate your account or linked channel #13999.";
      }

      await supabase.from("orders").update({
        status: "failed",
        failure_reason: errorMsg
      }).eq("order_reference", orderRef);

      return new Response(
        JSON.stringify({ success: false, message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save FinoQ transaction reference
    const transactionRef = payheroData.reference || payheroData.CheckoutRequestID || null;
    if (transactionRef) {
      await supabase.from("orders").update({
        payhero_reference: transactionRef,
        channel_id: Number(finoqChannelId),
        status: "processing"
      }).eq("order_reference", orderRef);
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_reference: orderRef,
        payhero_reference: transactionRef,
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
