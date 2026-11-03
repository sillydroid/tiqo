import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("Incoming M-Pesa / FinoQ Callback:", JSON.stringify(payload));

    const resp = (payload && typeof payload.response === "object" && payload.response !== null)
      ? payload.response
      : {};

    // Support flat, nested PayHero C2B and STK response formats
    const orderRef =
      payload.external_reference ||
      payload.ExternalReference ||
      payload.User_Reference ||
      payload.user_reference ||
      payload.order_reference ||
      payload.reference ||
      resp.ExternalReference ||
      resp.User_Reference ||
      resp.external_reference ||
      resp.user_reference ||
      resp.reference ||
      null;

    if (!orderRef) {
      console.error("Missing external_reference in callback. Full payload:", JSON.stringify(payload));
      return new Response(JSON.stringify({ error: "Missing external_reference" }), { status: 400 });
    }

    const providerRef =
      payload.provider_reference ||
      payload.mpesa_reference ||
      payload.MpesaReceiptNumber ||
      resp.MpesaReceiptNumber ||
      resp.MPESA_Reference ||
      resp.Transaction_Reference ||
      resp.provider_reference ||
      null;

    const payheroRef =
      payload.reference ||
      payload.checkout_request_id ||
      resp.CheckoutRequestID ||
      resp.MerchantRequestID ||
      null;

    const rawAmount =
      payload.amount ??
      resp.Amount ??
      resp.amount ??
      null;

    // Determine Success vs Failure
    const resultCode = resp.ResultCode;
    const statusVal = String(resp.Status || payload.status || "").toLowerCase();
    const wcStatus = String(resp.woocommerce_payment_status || "").toLowerCase();

    const isExplicitSuccess =
      payload.success === true ||
      statusVal === "success" ||
      statusVal === "true" ||
      wcStatus === "complete" ||
      resultCode === 0;

    const isExplicitFail =
      payload.success === false ||
      statusVal === "failed" ||
      statusVal === "false" ||
      (resultCode !== undefined && resultCode !== null && Number(resultCode) !== 0);

    const isSuccess = isExplicitSuccess && !isExplicitFail;

    const failureReason =
      resp.ResultDesc ||
      resp.Status ||
      payload.message ||
      (isExplicitFail ? "Payment was cancelled or could not be completed." : null);

    const providerName = payload.provider || resp.Payment_Method || "mpesa";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch current order with category & promo
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("order_reference", orderRef)
      .single();

    if (orderErr || !order) {
      console.error("Order not found for ref:", orderRef);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404 });
    }

    // 2. IDEMPOTENCY CHECK
    // If order is already paid, acknowledge immediately without duplicate processing
    if (order.status === "paid") {
      console.log(`Order ${orderRef} is already fulfilled. Skipping duplicate callback.`);
      return new Response(JSON.stringify({ status: "already_processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Log into Payments audit table
    await supabase.from("payments").insert({
      order_reference: orderRef,
      provider: providerName,
      provider_reference: providerRef,
      payhero_reference: payheroRef || order.payhero_reference,
      amount: rawAmount !== null ? Number(rawAmount) : order.total_amount,
      status: isSuccess ? "success" : "failed",
      raw_payload: payload
    });

    if (isSuccess) {
      // 4. Reconciliation: verify received amount
      const paidAmount = rawAmount !== null ? Number(rawAmount) : Number(order.total_amount);
      const expectedAmount = Number(order.total_amount);

      if (paidAmount < expectedAmount) {
        console.warn(`Underpayment detected! Paid: ${paidAmount}, Expected: ${expectedAmount}`);
        await supabase.from("orders").update({
          status: "failed",
          failure_reason: `Underpaid: received KSh ${paidAmount} but expected KSh ${expectedAmount}`
        }).eq("order_reference", orderRef);

        // Restore category inventory
        const { data: cat } = await supabase.from("ticket_categories").select("remaining_quantity, total_quantity").eq("id", order.ticket_category_id).single();
        if (cat) {
          await supabase.from("ticket_categories").update({
            remaining_quantity: Math.min(cat.total_quantity, cat.remaining_quantity + order.quantity)
          }).eq("id", order.ticket_category_id);
        }

        // Release seats
        await supabase.from("seat_maps").update({
          status: "available",
          order_id: null,
          reserved_until: null
        }).eq("order_id", order.id);

        return new Response(JSON.stringify({ status: "underpaid" }), { status: 200 });
      }

      // Mark order as PAID
      await supabase.from("orders").update({
        status: "paid",
        provider_reference: providerRef || order.provider_reference,
        payhero_reference: payheroRef || order.payhero_reference,
        paid_at: new Date().toISOString()
      }).eq("order_reference", orderRef);

      // Confirm seats as 'sold'
      await supabase.from("seat_maps").update({
        status: "sold",
        reserved_until: null
      }).eq("order_id", order.id);

      // If promo code applied, increment current_uses
      if (order.promo_code_id) {
        const { data: promo } = await supabase.from("promo_codes").select("current_uses").eq("id", order.promo_code_id).single();
        if (promo) {
          await supabase.from("promo_codes").update({ current_uses: (promo.current_uses || 0) + 1 }).eq("id", order.promo_code_id);
        }
      }

      // If referral code applied, record referral record
      if (order.referral_code) {
        await supabase.from("referrals").insert({
          referrer_code: order.referral_code,
          referee_order_id: order.id,
          reward_amount: 100.00,
          status: "credited"
        });
      }

      // Record audit log
      await supabase.from("audit_logs").insert({
        action: "PAYMENT_CONFIRMED",
        entity_type: "orders",
        entity_id: order.id,
        details: {
          order_reference: orderRef,
          amount_paid: paidAmount,
          mpesa_receipt: providerRef,
          customer: order.customer_name
        },
        performed_by: "mpesa_webhook"
      });

      console.log(`Order ${orderRef} successfully verified and paid! Receipt: ${providerRef}`);

    } else {
      // Payment Failed or Cancelled by customer
      const reason = failureReason || "M-Pesa payment cancelled or declined.";
      console.log(`Payment failed for ${orderRef}: ${reason}`);

      await supabase.from("orders").update({
        status: "failed",
        failure_reason: reason
      }).eq("order_reference", orderRef);

      // Restore category remaining quantity
      const { data: cat } = await supabase.from("ticket_categories").select("remaining_quantity, total_quantity").eq("id", order.ticket_category_id).single();
      if (cat) {
        await supabase.from("ticket_categories").update({
          remaining_quantity: Math.min(cat.total_quantity, cat.remaining_quantity + order.quantity)
        }).eq("id", order.ticket_category_id);
      }

      // Release reserved seats
      await supabase.from("seat_maps").update({
        status: "available",
        order_id: null,
        reserved_until: null
      }).eq("order_id", order.id);

      await supabase.from("audit_logs").insert({
        action: "PAYMENT_FAILED",
        entity_type: "orders",
        entity_id: order.id,
        details: { order_reference: orderRef, reason: reason },
        performed_by: "mpesa_webhook"
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Callback exception:", error);
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), { status: 500 });
  }
});
