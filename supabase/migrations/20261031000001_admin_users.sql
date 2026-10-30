-- ==============================================================================
-- TIKO: Admin Users Table & Upcoming Dates Update
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on admin_users" ON public.admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.admin_users TO postgres, service_role;

-- Seed Initial Super Admin: John Oyugi (vitupoaapp@gmail.com / @AlphaR254!)
INSERT INTO public.admin_users (name, email, password_hash, role, is_active)
VALUES (
    'John Oyugi',
    'vitupoaapp@gmail.com',
    '1405bf7836e1539bb8a7d61e33a8657dc391614b09a511c94120f43a7c09ffbe',
    'super_admin',
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now();

-- Update Ne-Yo Live in Concert date to future active upcoming date
UPDATE public.events
SET event_date = '2026-12-20',
    status = 'published'
WHERE slug = 'ne-yo-live-in-nairobi' OR id = 'c0000000-0000-0000-0000-000000000001';
