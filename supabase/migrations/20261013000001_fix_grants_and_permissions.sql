-- Fix table permissions and grants for PostgREST and Edge Functions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON TABLE public.tickets TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.orders TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.payments TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Ensure RLS policies allow SELECT for anon and authenticated
DROP POLICY IF EXISTS "Public can view active tickets" ON public.tickets;
CREATE POLICY "Public can view active tickets"
    ON public.tickets FOR SELECT
    TO public, anon, authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS "Allow public to check order by exact reference" ON public.orders;
CREATE POLICY "Allow public to check order by exact reference"
    ON public.orders FOR SELECT
    TO public, anon, authenticated, service_role
    USING (true);

DROP POLICY IF EXISTS "Allow public to insert orders" ON public.orders;
CREATE POLICY "Allow public to insert orders"
    ON public.orders FOR INSERT
    TO public, anon, authenticated, service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public to update orders" ON public.orders;
CREATE POLICY "Allow public to update orders"
    ON public.orders FOR UPDATE
    TO public, anon, authenticated, service_role
    USING (true);
