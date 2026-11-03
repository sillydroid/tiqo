-- ==============================================================================
-- TIKO: Storage Bucket for Event Posters & Enhanced Referrals Management
-- ==============================================================================

-- 1. Create storage bucket for event posters if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'event-posters',
    'event-posters',
    true,
    5242880, -- 5 MB maximum
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE 
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

-- Set storage object policies for public view and upload
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public View Event Posters" ON storage.objects;
    DROP POLICY IF EXISTS "Public Upload Event Posters" ON storage.objects;
    DROP POLICY IF EXISTS "Public Update Event Posters" ON storage.objects;
    DROP POLICY IF EXISTS "Service Role Full Access Posters" ON storage.objects;
END $$;

CREATE POLICY "Public View Event Posters" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'event-posters');

CREATE POLICY "Public Upload Event Posters" ON storage.objects
    FOR INSERT TO public WITH CHECK (bucket_id = 'event-posters');

CREATE POLICY "Public Update Event Posters" ON storage.objects
    FOR UPDATE TO public USING (bucket_id = 'event-posters');

CREATE POLICY "Service Role Full Access Posters" ON storage.objects
    FOR ALL TO service_role USING (bucket_id = 'event-posters') WITH CHECK (bucket_id = 'event-posters');

-- 2. Enhanced Referrals Status & Columns
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check 
    CHECK (status IN ('pending', 'qualified', 'applied', 'revoked', 'credited'));

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Make sure orders table has all tracking columns for audit
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payhero_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS provider_reference TEXT;
