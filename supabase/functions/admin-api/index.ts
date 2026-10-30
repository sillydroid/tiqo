import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Password Hashing Helper
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + "tiko_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // =========================================================================
    // ACTION: ADMIN LOGIN (Email & Password OR Master API Key)
    // =========================================================================
    if (action === "admin-login" || action === "login") {
      const { email, password, key } = body;

      // 1. Email & Password Login
      if (email && password) {
        const cleanEmail = email.trim().toLowerCase();
        const inputHash = await hashPassword(password);

        const { data: user, error: userErr } = await supabase
          .from("admin_users")
          .select("id, name, email, password_hash, role, is_active")
          .eq("email", cleanEmail)
          .maybeSingle();

        if (userErr || !user) {
          return new Response(
            JSON.stringify({ success: false, message: "Invalid email or password." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!user.is_active) {
          return new Response(
            JSON.stringify({ success: false, message: "This admin account has been disabled." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (user.password_hash !== inputHash) {
          return new Response(
            JSON.stringify({ success: false, message: "Invalid email or password." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Generate token encoding user id
        const sessionToken = btoa(JSON.stringify({ id: user.id, email: user.email, ts: Date.now() }));

        await supabase.from("audit_logs").insert({
          action: "ADMIN_LOGIN",
          entity_type: "admin_users",
          entity_id: user.id,
          performed_by: user.name,
          details: { email: user.email }
        });

        return new Response(
          JSON.stringify({
            success: true,
            token: sessionToken,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Fallback Master Key Login
      const masterKey = Deno.env.get("ADMIN_API_KEY") || "tiko_admin_secret_2026";
      const submittedKey = key || body.admin_key || "";
      if (submittedKey === masterKey) {
        return new Response(
          JSON.stringify({
            success: true,
            token: masterKey,
            user: {
              id: "master",
              name: "Super Admin",
              email: "admin@tiko.ke",
              role: "super_admin"
            }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, message: "Invalid credentials. Please provide valid email and password." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AUTHENTICATION CHECK FOR ALL OTHER ACTIONS
    // =========================================================================
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const masterKey = Deno.env.get("ADMIN_API_KEY") || "tiko_admin_secret_2026";

    let authenticatedAdmin = null;

    if (token === masterKey) {
      authenticatedAdmin = { id: "master", name: "Super Admin", email: "master@tiko.ke", role: "super_admin" };
    } else if (token) {
      try {
        const decoded = JSON.parse(atob(token));
        if (decoded?.id) {
          const { data: u } = await supabase.from("admin_users").select("id, name, email, role, is_active").eq("id", decoded.id).single();
          if (u && u.is_active) {
            authenticatedAdmin = u;
          }
        }
      } catch {
        // invalid token
      }
    }

    if (!authenticatedAdmin) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized: Invalid or expired session. Please log in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: ADMIN PROFILE & NAME EDIT
    // =========================================================================
    if (action === "update-admin-profile") {
      const { user_id, name } = body;
      const targetId = user_id || authenticatedAdmin.id;

      if (!name || name.trim() === "") {
        return new Response(
          JSON.stringify({ success: false, message: "Name cannot be empty." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updated, error: upErr } = await supabase
        .from("admin_users")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", targetId)
        .select("id, name, email, role")
        .single();

      if (upErr) throw upErr;

      return new Response(
        JSON.stringify({ success: true, message: "Profile name updated successfully.", user: updated }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: CHANGE ADMIN PASSWORD
    // =========================================================================
    if (action === "change-password") {
      const { user_id, current_password, new_password } = body;
      const targetId = user_id || authenticatedAdmin.id;

      if (!new_password || new_password.length < 6) {
        return new Response(
          JSON.stringify({ success: false, message: "New password must be at least 6 characters long." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If user is editing their own password, verify current password
      if (current_password) {
        const curHash = await hashPassword(current_password);
        const { data: checkU } = await supabase.from("admin_users").select("password_hash").eq("id", targetId).single();
        if (!checkU || checkU.password_hash !== curHash) {
          return new Response(
            JSON.stringify({ success: false, message: "Current password does not match." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const newHash = await hashPassword(new_password);
      const { error: passErr } = await supabase
        .from("admin_users")
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq("id", targetId);

      if (passErr) throw passErr;

      await supabase.from("audit_logs").insert({
        action: "CHANGE_ADMIN_PASSWORD",
        entity_type: "admin_users",
        entity_id: targetId,
        performed_by: authenticatedAdmin.name
      });

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: LIST ALL ADMIN USERS
    // =========================================================================
    if (action === "list-admin-users") {
      const { data: users, error: uErr } = await supabase
        .from("admin_users")
        .select("id, name, email, role, is_active, created_at, updated_at")
        .order("created_at", { ascending: true });

      if (uErr) throw uErr;

      return new Response(
        JSON.stringify({ success: true, users }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: CREATE NEW ADMIN USER
    // =========================================================================
    if (action === "create-admin-user") {
      const { name, email, password, role } = body;

      if (!name || !email || !password) {
        return new Response(
          JSON.stringify({ success: false, message: "Missing required fields (Name, Email, Password)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanEmail = email.trim().toLowerCase();
      const passHash = await hashPassword(password);

      const { data: newUser, error: insErr } = await supabase
        .from("admin_users")
        .insert({
          name: name.trim(),
          email: cleanEmail,
          password_hash: passHash,
          role: role || "admin",
          is_active: true
        })
        .select("id, name, email, role, is_active, created_at")
        .single();

      if (insErr) {
        if (insErr.message.includes("unique")) {
          return new Response(
            JSON.stringify({ success: false, message: "An admin with this email address already exists." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw insErr;
      }

      await supabase.from("audit_logs").insert({
        action: "CREATE_ADMIN_USER",
        entity_type: "admin_users",
        entity_id: newUser.id,
        details: { name: newUser.name, email: newUser.email, role: newUser.role },
        performed_by: authenticatedAdmin.name
      });

      return new Response(
        JSON.stringify({ success: true, message: "Admin user created successfully.", user: newUser }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: DELETE ADMIN USER
    // =========================================================================
    if (action === "delete-admin-user") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, message: "Missing user_id parameter." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (user_id === authenticatedAdmin.id) {
        return new Response(
          JSON.stringify({ success: false, message: "You cannot delete your own admin account." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: delErr } = await supabase
        .from("admin_users")
        .delete()
        .eq("id", user_id);

      if (delErr) throw delErr;

      await supabase.from("audit_logs").insert({
        action: "DELETE_ADMIN_USER",
        entity_type: "admin_users",
        entity_id: user_id,
        performed_by: authenticatedAdmin.name
      });

      return new Response(
        JSON.stringify({ success: true, message: "Admin user deleted successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: DASHBOARD STATS
    // =========================================================================
    if (action === "dashboard-stats") {
      const { count: totalEvents } = await supabase.from("events").select("*", { count: "exact", head: true });

      const { data: paidOrders } = await supabase
        .from("orders")
        .select("quantity, total_amount, event_id")
        .eq("status", "paid");

      let totalTicketsSold = 0;
      let totalRevenue = 0;
      const salesByEvent: Record<string, { sold: number; revenue: number }> = {};

      if (paidOrders) {
        for (const order of paidOrders) {
          const qty = Number(order.quantity) || 0;
          const rev = Number(order.total_amount) || 0;
          totalTicketsSold += qty;
          totalRevenue += rev;

          if (order.event_id) {
            if (!salesByEvent[order.event_id]) {
              salesByEvent[order.event_id] = { sold: 0, revenue: 0 };
            }
            salesByEvent[order.event_id].sold += qty;
            salesByEvent[order.event_id].revenue += rev;
          }
        }
      }

      const { data: allEvents } = await supabase
        .from("events")
        .select(`
          id,
          name,
          event_date,
          venue,
          status,
          ticket_categories (
            total_quantity,
            remaining_quantity
          )
        `)
        .order("created_at", { ascending: false });

      const eventsSummary = (allEvents || []).map((ev: any) => {
        const cats = ev.ticket_categories || [];
        const totalCap = cats.reduce((sum: number, c: any) => sum + (Number(c.total_quantity) || 0), 0);
        const totalRem = cats.reduce((sum: number, c: any) => sum + (Number(c.remaining_quantity) || 0), 0);
        const eventSales = salesByEvent[ev.id] || { sold: 0, revenue: 0 };

        return {
          id: ev.id,
          name: ev.name,
          date: ev.event_date,
          venue: ev.venue,
          status: ev.status,
          total_capacity: totalCap,
          tickets_sold: eventSales.sold,
          revenue: eventSales.revenue,
          remaining: totalRem
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            total_events: totalEvents || 0,
            total_tickets_sold: totalTicketsSold,
            total_revenue: totalRevenue,
            events: eventsSummary
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: LIST ALL EVENTS (FOR ADMIN)
    // =========================================================================
    if (action === "list-events") {
      const { data: events, error } = await supabase
        .from("events")
        .select(`
          *,
          ticket_categories (*)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, events }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: CREATE EVENT WITH TICKET CATEGORIES
    // =========================================================================
    if (action === "create-event") {
      const {
        name,
        slug,
        venue,
        event_date,
        event_time,
        end_time,
        description,
        poster_url,
        category,
        seating_model,
        ticket_categories
      } = body;

      if (!name || !venue || !event_date || !event_time) {
        return new Response(
          JSON.stringify({ success: false, message: "Missing required fields (Name, Venue, Date, Time)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const finalSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") + "-" + Math.floor(100 + Math.random() * 900);

      const { data: event, error: eventErr } = await supabase
        .from("events")
        .insert({
          name: name.trim(),
          slug: finalSlug,
          venue: venue.trim(),
          event_date: event_date,
          event_time: event_time.trim(),
          end_time: end_time ? end_time.trim() : null,
          description: description || "",
          poster_url: poster_url || "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200",
          category: category || "concert",
          seating_model: seating_model || "general_admission",
          status: "published"
        })
        .select()
        .single();

      if (eventErr || !event) {
        return new Response(
          JSON.stringify({ success: false, message: eventErr?.message || "Could not insert event." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const categoriesToInsert = (Array.isArray(ticket_categories) && ticket_categories.length > 0)
        ? ticket_categories
        : [
            { name: "Regular", price: 2000, total_quantity: 5000, sort_order: 1 },
            { name: "Gold", price: 5000, total_quantity: 1000, sort_order: 2 },
            { name: "VIP", price: 10000, total_quantity: 500, sort_order: 3 },
            { name: "Platinum", price: 20000, total_quantity: 100, sort_order: 4 }
          ];

      const catInserts = categoriesToInsert.map((c: any, idx: number) => ({
        event_id: event.id,
        name: c.name.trim(),
        price: Number(c.price),
        original_price: c.original_price ? Number(c.original_price) : null,
        total_quantity: Number(c.total_quantity),
        remaining_quantity: Number(c.total_quantity),
        attendees_per_unit: Number(c.attendees_per_unit) || 1,
        sort_order: c.sort_order ?? (idx + 1),
        is_active: true
      }));

      const { data: insertedCats } = await supabase
        .from("ticket_categories")
        .insert(catInserts)
        .select();

      await supabase.from("audit_logs").insert({
        action: "CREATE_EVENT",
        entity_type: "events",
        entity_id: event.id,
        details: { name: event.name, categories_count: catInserts.length },
        performed_by: authenticatedAdmin.name
      });

      return new Response(
        JSON.stringify({ success: true, event: { ...event, ticket_categories: insertedCats } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: EDIT / UPDATE EVENT (WITH TICKET CATEGORIES RECONCILIATION)
    // =========================================================================
    if (action === "update-event") {
      const {
        event_id,
        name,
        venue,
        event_date,
        event_time,
        end_time,
        description,
        poster_url,
        category,
        seating_model,
        status,
        ticket_categories
      } = body;

      if (!event_id) {
        return new Response(
          JSON.stringify({ success: false, message: "Missing event_id." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      if (name) updateData.name = name.trim();
      if (venue) updateData.venue = venue.trim();
      if (event_date) updateData.event_date = event_date;
      if (event_time) updateData.event_time = event_time.trim();
      if (end_time !== undefined) updateData.end_time = end_time;
      if (description !== undefined) updateData.description = description;
      if (poster_url !== undefined) updateData.poster_url = poster_url;
      if (category) updateData.category = category;
      if (seating_model) updateData.seating_model = seating_model;
      if (status) updateData.status = status;

      const { data: updatedEvent, error: updateErr } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", event_id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Reconcile ticket categories
      if (Array.isArray(ticket_categories) && ticket_categories.length > 0) {
        for (const cat of ticket_categories) {
          if (cat.id) {
            await supabase.from("ticket_categories").update({
              name: cat.name.trim(),
              price: Number(cat.price),
              original_price: cat.original_price ? Number(cat.original_price) : null,
              total_quantity: Number(cat.total_quantity),
              updated_at: new Date().toISOString()
            }).eq("id", cat.id);
          } else {
            const qty = Number(cat.total_quantity);
            await supabase.from("ticket_categories").insert({
              event_id: event_id,
              name: cat.name.trim(),
              price: Number(cat.price),
              original_price: cat.original_price ? Number(cat.original_price) : null,
              total_quantity: qty,
              remaining_quantity: qty,
              attendees_per_unit: Number(cat.attendees_per_unit) || 1,
              is_active: true
            });
          }
        }
      }

      await supabase.from("audit_logs").insert({
        action: "UPDATE_EVENT",
        entity_type: "events",
        entity_id: event_id,
        details: updateData,
        performed_by: authenticatedAdmin.name
      });

      return new Response(
        JSON.stringify({ success: true, event: updatedEvent }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: PUBLISH / UNPUBLISH EVENT
    // =========================================================================
    if (action === "publish-event") {
      const { event_id, status } = body;
      const newStatus = status || "published";

      const { error } = await supabase
        .from("events")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", event_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: `Event status updated to ${newStatus}.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: DELETE / CANCEL EVENT
    // =========================================================================
    if (action === "delete-event") {
      const { event_id } = body;

      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", event_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: "Event cancelled successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: PROMO CODES
    // =========================================================================
    if (action === "list-promos") {
      const { data: promos, error } = await supabase
        .from("promo_codes")
        .select("*, events(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, promos }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "create-promo") {
      const { code, event_id, discount_type, discount_value, max_uses, min_order_amount, expires_at } = body;

      const { data: promo, error } = await supabase
        .from("promo_codes")
        .insert({
          code: String(code).trim().toUpperCase(),
          event_id: event_id || null,
          discount_type: discount_type || "percentage",
          discount_value: Number(discount_value),
          max_uses: max_uses ? Number(max_uses) : null,
          min_order_amount: min_order_amount ? Number(min_order_amount) : 0,
          expires_at: expires_at || null,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, promo }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: LIST ORDERS
    // =========================================================================
    if (action === "list-orders") {
      const { event_id, status, limit, offset } = body;

      let query = supabase
        .from("orders")
        .select(`
          *,
          events (name, venue, event_date),
          ticket_categories (name)
        `, { count: "exact" })
        .order("created_at", { ascending: false });

      if (event_id) query = query.eq("event_id", event_id);
      if (status && status !== "all") query = query.eq("status", status);

      const pageLimit = Number(limit) || 50;
      const pageOffset = Number(offset) || 0;
      query = query.range(pageOffset, pageOffset + pageLimit - 1);

      const { data: orders, count, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, orders, total: count }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // ACTION: AUDIT LOGS
    // =========================================================================
    if (action === "list-audit-logs") {
      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, logs }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: `Unknown admin action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Admin API Error:", err);
    return new Response(
      JSON.stringify({ success: false, message: err?.message || "Internal admin error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
