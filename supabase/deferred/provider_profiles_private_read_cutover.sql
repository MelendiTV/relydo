-- Phase 2 / DEFERRED CUTOVER
-- DO NOT apply until old Cliente versions that directly read
-- public.provider_profiles can safely be retired.

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
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;