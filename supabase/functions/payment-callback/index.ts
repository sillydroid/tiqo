import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("Incoming PayHero / FinoQ Payment Callback:", JSON.stringify(payload));

    const {
      success,
      status,
      reference,
      external_reference,
      amount,
      provider_reference,
      message,
      provider
    } = payload;

    const orderRef = external_reference;
    if (!orderRef) {
      console.error("Missing external_reference in callback payload");
      return new Response(JSON.stringify({ error: "Missing external_reference" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch current order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_reference", orderRef)
      .single();

    if (orderError || !order) {
      console.error("Order not found for reference:", orderRef);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    // 2. IDEMPOTENCY CHECK:
    // If order is already paid, acknowledge immediately without re-processing
    if (order.status === "paid") {
      console.log(`Order ${orderRef} is already fulfilled. Skipping duplicate processing.`);
      return new Response(JSON.stringify({ status: "already_processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Log payment attempt in audit table
    await supabase.from("payments").insert({
      order_reference: orderRef,
      provider: provider || "mpesa",
      provider_reference: provider_reference || null,
      payhero_reference: reference || null,
      amount: Number(amount) || order.total_amount,
      status: String(status || (success ? "success" : "failed")),
      raw_payload: payload
    });

    // 4. Validate transaction success & reconciliation
    const isSuccess = success === true || String(status).toLowerCase() === "success";

    if (isSuccess) {
      // Reconcile amount (allow float tolerance)
      const paidAmount = Number(amount);
      const expectedAmount = Number(order.total_amount);

      if (paidAmount < expectedAmount) {
        console.warn(`Underpayment detected! Paid: ${paidAmount}, Expected: ${expectedAmount}`);
        await supabase.from("orders").update({
          status: "failed",
          failure_reason: `Underpaid: received KSh ${paidAmount} but expected KSh ${expectedAmount}`
        }).eq("order_reference", orderRef);

        return new Response(JSON.stringify({ status: "underpaid" }), { status: 200 });
      }

      // Mark order as paid & record M-Pesa receipt
      const { error: updateError } = await supabase.from("orders").update({
        status: "paid",
        provider_reference: provider_reference || null,
        payhero_reference: reference || order.payhero_reference,
        paid_at: new Date().toISOString()
      }).eq("order_reference", orderRef);

      if (updateError) {
        console.error("Error updating order to paid:", updateError);
        return new Response(JSON.stringify({ error: "Database update error" }), { status: 500 });
      }

      console.log(`Order ${orderRef} successfully verified and paid! M-Pesa Receipt: ${provider_reference}`);

    } else {
      // Transaction failed or user cancelled prompt
      console.log(`Payment failed for order ${orderRef}: ${message || status}`);
      await supabase.from("orders").update({
        status: "failed",
        failure_reason: message || "Payment cancelled or failed"
      }).eq("order_reference", orderRef);
    }

    // Return 200 OK to PayHero to acknowledge receipt
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Callback processing exception:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
