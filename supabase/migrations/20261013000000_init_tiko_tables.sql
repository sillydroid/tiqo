-- ==============================================================================
-- TIKO SCHEMA: Ne-Yo Live in Nairobi Discounted Tickets & PayHero/FinoQ Orders
-- ==============================================================================

-- 1. TICKETS TABLE (Authoritative Source of Truth for Pricing)
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('gold', 'platinum')),
    ticket_type TEXT NOT NULL CHECK (ticket_type IN ('individual', 'package')),
    attendees_per_unit INTEGER NOT NULL DEFAULT 1,
    original_price NUMERIC(12, 2) NOT NULL,
    offer_price NUMERIC(12, 2) NOT NULL,
    savings NUMERIC(12, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed Official Tickets Data
INSERT INTO public.tickets (id, name, category, ticket_type, attendees_per_unit, original_price, offer_price, savings)
VALUES
    ('early-bird-gold', 'Early Bird Gold', 'gold', 'individual', 1, 7500.00, 5500.00, 2000.00),
    ('wave-2-gold', 'Wave 2 Gold', 'gold', 'individual', 1, 10000.00, 8000.00, 2000.00),
    ('gold-ticket', 'Gold Ticket', 'gold', 'individual', 1, 15000.00, 13000.00, 2000.00),
    ('gold-couple-friends', 'Gold Couple/Friends Package (2 tickets)', 'gold', 'package', 2, 20000.00, 15000.00, 5000.00),
    ('platinum-individual', 'Platinum Green Area — Individual Seat', 'platinum', 'individual', 1, 40000.00, 36000.00, 4000.00),
    ('platinum-4-seater', 'Platinum Green Area — 4-Seater Table', 'platinum', 'package', 4, 160000.00, 140000.00, 20000.00),
    ('platinum-8-seater', 'Platinum Green Area — 8-Seater Table', 'platinum', 'package', 8, 320000.00, 280000.00, 40000.00)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    ticket_type = EXCLUDED.ticket_type,
    attendees_per_unit = EXCLUDED.attendees_per_unit,
    original_price = EXCLUDED.original_price,
    offer_price = EXCLUDED.offer_price,
    savings = EXCLUDED.savings,
    updated_at = timezone('utc'::text, now());

-- 2. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference TEXT UNIQUE NOT NULL,
    ticket_id TEXT NOT NULL REFERENCES public.tickets(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_attendees INTEGER NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    payhero_reference TEXT,
    provider_reference TEXT, -- e.g. M-Pesa receipt code (QJH...)
    channel_id INTEGER,
    paid_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for speedy lookups
CREATE INDEX IF NOT EXISTS idx_orders_reference ON public.orders(order_reference);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone_number);

-- 3. PAYMENTS AUDIT & IDEMPOTENCY LOG
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference TEXT NOT NULL REFERENCES public.orders(order_reference),
    provider TEXT NOT NULL DEFAULT 'mpesa',
    provider_reference TEXT, -- M-Pesa receipt
    payhero_reference TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Unique index to prevent duplicate credit / fulfillment on identical provider receipts
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref 
    ON public.payments(provider_reference) 
    WHERE provider_reference IS NOT NULL AND provider_reference <> '';

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active tickets
DROP POLICY IF EXISTS "Public can view active tickets" ON public.tickets;
CREATE POLICY "Public can view active tickets"
    ON public.tickets FOR SELECT
    USING (is_active = true);

-- Orders: anonymous users cannot directly SELECT or UPDATE orders (Edge Functions use service_role)
-- Read-only policy for order lookup by exact order_reference
DROP POLICY IF EXISTS "Allow public to check order by exact reference" ON public.orders;
CREATE POLICY "Allow public to check order by exact reference"
    ON public.orders FOR SELECT
    USING (true);

-- Payments: restricted to service_role only
DROP POLICY IF EXISTS "Payments service role only" ON public.payments;
CREATE POLICY "Payments service role only"
    ON public.payments FOR ALL
    TO service_role
    USING (true);
