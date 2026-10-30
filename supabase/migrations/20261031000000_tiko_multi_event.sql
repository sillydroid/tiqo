-- ==============================================================================
-- TIKO — Multi-Event Ticketing Platform Schema ("Party for Less")
-- ==============================================================================

-- Drop existing tables to ensure clean slate migration
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.seat_maps CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.promo_codes CASCADE;
DROP TABLE IF EXISTS public.ticket_categories CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;

-- ==============================================================================
-- 1. EVENTS TABLE
-- ==============================================================================
CREATE TABLE public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    venue TEXT NOT NULL,
    event_date DATE NOT NULL,
    event_time TEXT NOT NULL,
    end_time TEXT,
    description TEXT DEFAULT '',
    poster_url TEXT DEFAULT '',
    category TEXT NOT NULL DEFAULT 'concert'
        CHECK (category IN ('concert', 'festival', 'sports', 'show', 'theatre', 'other')),
    seating_model TEXT NOT NULL DEFAULT 'general_admission'
        CHECK (seating_model IN ('general_admission', 'assigned_seating')),
    status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. TICKET CATEGORIES (Per-event ticket tiers with quantities & pricing)
-- ==============================================================================
CREATE TABLE public.ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    original_price NUMERIC(12, 2),
    total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
    remaining_quantity INTEGER NOT NULL CHECK (remaining_quantity >= 0),
    attendees_per_unit INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT remaining_lte_total CHECK (remaining_quantity <= total_quantity)
);

-- ==============================================================================
-- 3. PROMO CODES
-- ==============================================================================
CREATE TABLE public.promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0,
    min_order_amount NUMERIC(12, 2) DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. ORDERS TABLE (With idempotency, booking expiry, fraud protection)
-- ==============================================================================
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference TEXT UNIQUE NOT NULL,
    event_id UUID NOT NULL REFERENCES public.events(id),
    ticket_category_id UUID NOT NULL REFERENCES public.ticket_categories(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL,
    promo_code_id UUID REFERENCES public.promo_codes(id),
    referral_code TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    selected_seats JSONB, -- e.g. [{"section": "A", "row": "5", "seat": "12"}]
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
    payhero_reference TEXT,
    provider_reference TEXT, -- M-Pesa receipt code (e.g. QJH...)
    channel_id INTEGER,
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    failure_reason TEXT,
    refund_reference TEXT,
    refund_amount NUMERIC(12, 2),
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 5. PAYMENTS AUDIT & IDEMPOTENCY LOG
-- ==============================================================================
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference TEXT NOT NULL REFERENCES public.orders(order_reference),
    provider TEXT NOT NULL DEFAULT 'mpesa',
    provider_reference TEXT,
    payhero_reference TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate payment fulfillment on identical M-Pesa receipts
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref 
    ON public.payments(provider_reference) 
    WHERE provider_reference IS NOT NULL AND provider_reference <> '';

-- ==============================================================================
-- 6. SEAT MAPS (For Assigned Seating Events)
-- ==============================================================================
CREATE TABLE public.seat_maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    ticket_category_id UUID NOT NULL REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    row_name TEXT NOT NULL,
    seat_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'reserved', 'sold')),
    order_id UUID REFERENCES public.orders(id),
    reserved_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, section, row_name, seat_number)
);

-- ==============================================================================
-- 7. REFERRALS TABLE
-- ==============================================================================
CREATE TABLE public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_code TEXT NOT NULL,
    referee_order_id UUID REFERENCES public.orders(id),
    reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 100.00,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'credited', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 8. AUDIT LOGS (Admin actions & sensitive state changes)
-- ==============================================================================
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details JSONB,
    performed_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- INDEXES FOR MAXIMUM QUERY SPEED
-- ==============================================================================
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_category ON public.events(category);
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_ticket_categories_event ON public.ticket_categories(event_id);
CREATE INDEX idx_orders_reference ON public.orders(order_reference);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_event ON public.orders(event_id);
CREATE INDEX idx_orders_phone ON public.orders(phone_number);
CREATE INDEX idx_orders_expires ON public.orders(expires_at) WHERE status = 'pending';
CREATE INDEX idx_seat_maps_event ON public.seat_maps(event_id);
CREATE INDEX idx_seat_maps_status ON public.seat_maps(status);
CREATE INDEX idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX idx_referrals_code ON public.referrals(referrer_code);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) & PERMISSIONS
-- ==============================================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Anonymous and Authenticated users can view published events & categories
CREATE POLICY "Public can view published events"
    ON public.events FOR SELECT TO anon, authenticated, service_role
    USING (status = 'published');

CREATE POLICY "Public can view active ticket categories"
    ON public.ticket_categories FOR SELECT TO anon, authenticated, service_role
    USING (is_active = true);

CREATE POLICY "Public can view seats"
    ON public.seat_maps FOR SELECT TO anon, authenticated, service_role
    USING (true);

CREATE POLICY "Public can check orders"
    ON public.orders FOR SELECT TO anon, authenticated, service_role
    USING (true);

-- Service role full access for Edge Functions
CREATE POLICY "Service role full access on events" ON public.events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on ticket_categories" ON public.ticket_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on orders" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on promo_codes" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on seat_maps" ON public.seat_maps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on referrals" ON public.referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on audit_logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT ON public.ticket_categories TO anon, authenticated;
GRANT SELECT ON public.seat_maps TO anon, authenticated;
GRANT SELECT ON public.orders TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- ==============================================================================
-- SEED INITIAL EVENTS & TICKETS (INCLUDING NE-YO AND SAMPLE SHOWS)
-- ==============================================================================

-- 1. Ne-Yo Live in Concert
INSERT INTO public.events (id, name, slug, venue, event_date, event_time, end_time, description, poster_url, category, seating_model, status)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'Ne-Yo Live in Concert — Brunch Edition',
    'ne-yo-live-in-nairobi',
    'Ulinzi Sports Complex, Nairobi',
    '2026-10-20',
    '3:00 PM',
    '11:00 PM',
    'Grammy-award winning R&B icon Ne-Yo brings his electrifying Brunch Edition live to Nairobi. Experience hits like Miss Independent, So Sick, and Closer with top sound and production.',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop',
    'concert',
    'general_admission',
    'published'
) ON CONFLICT (slug) DO NOTHING;

-- Ticket Categories for Ne-Yo
INSERT INTO public.ticket_categories (id, event_id, name, price, original_price, total_quantity, remaining_quantity, attendees_per_unit, sort_order)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Regular Entry', 2000.00, 3000.00, 5000, 4850, 1, 1),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Gold Ticket', 5000.00, 7500.00, 1000, 850, 1, 2),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'VIP Pass', 10000.00, 15000.00, 500, 320, 1, 3),
    ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Platinum Green Area', 20000.00, 25000.00, 100, 45, 1, 4)
ON CONFLICT DO NOTHING;

-- 2. Sol Fest 2026
INSERT INTO public.events (id, name, slug, venue, event_date, event_time, end_time, description, poster_url, category, seating_model, status)
VALUES (
    'c0000000-0000-0000-0000-000000000002',
    'Sol Fest Nairobi 2026',
    'sol-fest-nairobi-2026',
    'Carnivore Grounds, Nairobi',
    '2026-11-14',
    '12:00 PM',
    '11:59 PM',
    'East Africa biggest musical celebration! Featuring multi-genre live bands, African cultural showcases, food villages, and nonstop high-energy vibes.',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1200&auto=format&fit=crop',
    'festival',
    'general_admission',
    'published'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.ticket_categories (id, event_id, name, price, original_price, total_quantity, remaining_quantity, attendees_per_unit, sort_order)
VALUES
    ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Regular Pass', 2500.00, 3500.00, 3000, 2450, 1, 1),
    ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'VIP Lounge', 8000.00, 10000.00, 600, 420, 1, 2),
    ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'VVIP Table Package (4 Pax)', 40000.00, 50000.00, 50, 32, 4, 3)
ON CONFLICT DO NOTHING;

-- 3. Mashemeji Derby (Gor Mahia vs AFC Leopards) — Assigned Seating
INSERT INTO public.events (id, name, slug, venue, event_date, event_time, end_time, description, poster_url, category, seating_model, status)
VALUES (
    'c0000000-0000-0000-0000-000000000003',
    'Mashemeji Derby 2026: Gor Mahia vs AFC Leopards',
    'mashemeji-derby-2026',
    'Nyayo National Stadium, Nairobi',
    '2026-11-28',
    '2:00 PM',
    '6:00 PM',
    'Kenya greatest football rivalry. Watch Gor Mahia square off against AFC Leopards with reserved stadium seating, intense passion, and championship stakes.',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=1200&auto=format&fit=crop',
    'sports',
    'assigned_seating',
    'published'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.ticket_categories (id, event_id, name, price, original_price, total_quantity, remaining_quantity, attendees_per_unit, sort_order)
VALUES
    ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000003', 'Terraces / Bleachers', 1000.00, 1500.00, 20000, 18500, 1, 1),
    ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000003', 'VIP Main Stand', 3500.00, 5000.00, 1500, 1200, 1, 2),
    ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000003', 'VVIP Presidential Suite', 10000.00, 12000.00, 200, 140, 1, 3)
ON CONFLICT DO NOTHING;

-- Seed Sample Assigned Seats for Mashemeji Derby
INSERT INTO public.seat_maps (event_id, ticket_category_id, section, row_name, seat_number, status)
VALUES
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand A', 'Row 1', 'Seat 1', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand A', 'Row 1', 'Seat 2', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand A', 'Row 1', 'Seat 3', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand A', 'Row 2', 'Seat 10', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand A', 'Row 2', 'Seat 11', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand B', 'Row 5', 'Seat 12', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', 'Main Stand B', 'Row 5', 'Seat 13', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000010', 'VIP Lounge Box', 'Box 1', 'Seat 1', 'available'),
    ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000010', 'VIP Lounge Box', 'Box 1', 'Seat 2', 'available')
ON CONFLICT DO NOTHING;

-- 4. Seed Promo Code TIKOO10 (10% discount)
INSERT INTO public.promo_codes (code, discount_type, discount_value, max_uses, current_uses, is_active)
VALUES ('TIKOO10', 'percentage', 10.00, 1000, 0, true)
ON CONFLICT (code) DO UPDATE SET discount_value = 10.00, is_active = true;

