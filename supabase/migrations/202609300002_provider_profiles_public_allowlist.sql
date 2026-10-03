-- Public provider allowlist and immediate private-read lockdown.
-- Legacy clients must use public_provider_profiles for public directory reads.
BEGIN;


ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  "Public can view verified providers"
ON public.provider_profiles;

DROP POLICY IF EXISTS
  provider_profiles_private_read_guard
ON public.provider_profiles;

CREATE POLICY provider_profiles_private_read_guard
ON public.provider_profiles
AS RESTRICTIVE
FOR SELECT
TO PUBLIC
USING (
  user_id = auth.uid()
  OR public.has_admin_permission('providers')
  OR public.has_admin_permission('claims')
  OR public.has_admin_permission('orders')
);

REVOKE SELECT
ON public.provider_profiles
FROM PUBLIC, anon;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT attname
    FROM pg_attribute
    WHERE
      attrelid = 'public.provider_profiles'::regclass
      AND attnum > 0
      AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%I) ON public.provider_profiles FROM PUBLIC, anon',
      c.attname
    );
  END LOOP;
END
$$;

GRANT SELECT
ON public.provider_profiles
TO authenticated, service_role;


CREATE OR REPLACE VIEW public.public_provider_profiles
WITH (security_barrier=true) AS
SELECT
  user_id,
  business_name,
  bio,
  trade,
  years_experience,
  service_radius_miles,
  average_rating,
  completed_jobs,
  verified,
  active,
  verification_status,
  city,
  state,
  CASE
    WHEN zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'
    THEN left(zip_code, 5)
  END AS zip_code,
  avatar_url,
  company_logo_url,
  cover_url,
  (nullif(btrim(license_number), '') IS NOT NULL) AS has_license,
  insured,
  bonded
FROM public.provider_profiles
WHERE
  verification_status = 'verified'
  AND verified = true
  AND active = true;

ALTER VIEW public.public_provider_profiles OWNER TO postgres;

REVOKE ALL
ON public.public_provider_profiles
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON public.public_provider_profiles
TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_provider_profiles IS
  'Public Pro allowlist; no exact location, documents, license numbers, financial or internal fields. ZIP is coarse five-digit location only.';

DROP POLICY IF EXISTS
  "Authenticated users can create own service requests"
ON public.service_requests;

CREATE POLICY
  "Authenticated users can create own service requests"
ON public.service_requests
FOR INSERT
TO authenticated
WITH CHECK (
  (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE
        p.id = auth.uid()
        AND p.role = ANY (ARRAY['customer'::text, 'provider'::text])
    )
  )
  AND status = 'open'::text
  AND job_stage IS NULL
  AND cancellation_reason IS NULL
  AND cancelled_at IS NULL
  AND completed_at IS NULL
  AND completion_review_status IS NULL
  AND submitted_for_review_at IS NULL
  AND completion_approved_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.services s
    WHERE
      s.id = service_requests.service_id
      AND s.active = true
  )
  AND (
    preferred_provider_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.public_provider_profiles pp
      WHERE
        pp.user_id = service_requests.preferred_provider_id
        AND pp.verification_status = 'verified'::text
        AND pp.verified = true
        AND pp.active = true
    )
  )
);

DROP POLICY IF EXISTS
  "Public can view provider reviews"
ON public.reviews;

CREATE POLICY
  "Public can view provider reviews"
ON public.reviews
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM public.public_provider_profiles pp
    WHERE
      pp.user_id = reviews.reviewee_id
      AND pp.verification_status = 'verified'::text
      AND pp.verified = true
      AND pp.active = true
  )
);

REVOKE EXECUTE
ON FUNCTION public.relydo_provider_payments_ready(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.relydo_provider_payments_ready(uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;