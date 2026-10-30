import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("Incoming M-Pesa / FinoQ Callback:", JSON.stringify(payload));

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
      console.error("Missing external_reference in callback");
      return new Response(JSON.stringify({ error: "Missing external_reference" }), { status: 400 });
    }

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
      provider: provider || "mpesa",
      provider_reference: provider_reference || null,
      payhero_reference: reference || null,
      amount: Number(amount) || order.total_amount,
      status: String(status || (success ? "success" : "failed")),
      raw_payload: payload
    });

    const isSuccess = success === true || String(status).toLowerCase() === "success";

    if (isSuccess) {
      // 4. Reconciliation: verify received amount
      const paidAmount = Number(amount);
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
        provider_reference: provider_reference || null,
        payhero_reference: reference || order.payhero_reference,
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
          mpesa_receipt: provider_reference,
          customer: order.customer_name
        },
        performed_by: "mpesa_webhook"
      });

      console.log(`Order ${orderRef} successfully verified and paid! Receipt: ${provider_reference}`);

    } else {
      // Payment Failed or Cancelled by customer
      const reason = message || status || "M-Pesa payment cancelled or declined.";
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
