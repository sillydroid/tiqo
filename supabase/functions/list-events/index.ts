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
    const id = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const todayStr = new Date().toISOString().split("T")[0];

    // If requesting a single event by ID or Slug
    if (id || slug) {
      let query = supabase
        .from("events")
        .select(`
          id,
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
          status,
          ticket_categories (
            id,
            name,
            price,
            original_price,
            total_quantity,
            remaining_quantity,
            attendees_per_unit,
            sort_order,
            is_active
          )
        `);

      if (id) {
        query = query.eq("id", id);
      } else if (slug) {
        query = query.eq("slug", slug);
      }

      const { data: event, error: eventError } = await query.maybeSingle();

      if (eventError || !event) {
        return new Response(
          JSON.stringify({ success: false, message: "Event not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if ended
      const isEnded = event.event_date < todayStr || event.status === "completed";

      // Sort ticket categories
      if (Array.isArray(event.ticket_categories)) {
        event.ticket_categories = event.ticket_categories
          .filter((tc: any) => tc.is_active !== false)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }

      // If assigned seating, fetch available seats
      let seatMaps: any[] = [];
      if (event.seating_model === "assigned_seating") {
        const { data: seats } = await supabase
          .from("seat_maps")
          .select("id, ticket_category_id, section, row_name, seat_number, status")
          .eq("event_id", event.id)
          .order("section", { ascending: true })
          .order("row_name", { ascending: true })
          .order("seat_number", { ascending: true });

        seatMaps = seats || [];
      }

      return new Response(
        JSON.stringify({
          success: true,
          event: {
            ...event,
            is_ended: isEnded,
            seats: seatMaps
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List published events
    let query = supabase
      .from("events")
      .select(`
        id,
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
        status,
        ticket_categories (
          id,
          name,
          price,
          original_price,
          total_quantity,
          remaining_quantity,
          sort_order,
          is_active
        )
      `)
      .in("status", ["published", "completed"]);

    if (category && category !== "all") {
      query = query.eq("category", category.toLowerCase());
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},venue.ilike.${term},description.ilike.${term}`);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("List events error:", error);
      return new Response(
        JSON.stringify({ success: false, message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process events and partition: UPCOMING first, ENDED at bottom
    const processedEvents = (events || []).map((ev: any) => {
      const isEnded = ev.event_date < todayStr || ev.status === "completed";
      const activeCats = (ev.ticket_categories || [])
        .filter((c: any) => c.is_active !== false)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const prices = activeCats.map((c: any) => Number(c.price));
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const totalRemaining = activeCats.reduce((sum: number, c: any) => sum + (Number(c.remaining_quantity) || 0), 0);

      return {
        ...ev,
        is_ended: isEnded,
        ticket_categories: activeCats,
        starting_price: minPrice,
        total_remaining: totalRemaining
      };
    });

    // Sort: Upcoming events (ascending by date), then Ended events (descending by date)
    const upcoming = processedEvents
      .filter((e: any) => !e.is_ended)
      .sort((a: any, b: any) => a.event_date.localeCompare(b.event_date));

    const ended = processedEvents
      .filter((e: any) => e.is_ended)
      .sort((a: any, b: any) => b.event_date.localeCompare(a.event_date));

    const sortedEvents = [...upcoming, ...ended];

    return new Response(
      JSON.stringify({ success: true, events: sortedEvents }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Unexpected error in list-events:", err);
    return new Response(
      JSON.stringify({ success: false, message: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
