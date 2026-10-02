-- Harden only provider_documents and provider_document_requests.
-- Keep existing SELECT and Admin policies/grants; do not grant Pro DELETE.
-- Restrictive guards also constrain older permissive policies, regardless of name.
-- Recreate only this migration's named policies/triggers; preserve foreign Admin objects.
-- Live prerequisites to verify before applying: public.has_admin_permission(text)
-- must authorize the current caller for 'providers', work under RLS and under
-- this SECURITY DEFINER function, and be executable by authenticated callers.
-- Existing permissive Admin policies/grants must allow the intended operations;
-- these restrictive guards do not grant Admin access on their own.
-- Backend exemption trusts only the platform-verified service_role JWT claim.
-- Verify service_role retains its intended BYPASSRLS/grants in live.
-- Direct maintenance without that context is deliberately not exempted.
-- Verify live policies, trigger order, function ownership and session semantics;
-- the active-session match below does not independently check expiry/revocation.
BEGIN;

ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_document_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_documents_pro_insert ON public.provider_documents;
CREATE POLICY provider_documents_pro_insert
ON public.provider_documents FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND rejection_reason IS NULL
  AND expiration_date IS NULL
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND approved_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'provider'
  )
);

-- AND this guard with every permissive INSERT policy, including legacy ones.
DROP POLICY IF EXISTS provider_documents_pro_insert_guard ON public.provider_documents;
CREATE POLICY provider_documents_pro_insert_guard
ON public.provider_documents AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.has_admin_permission('providers')
  OR (
  user_id = auth.uid()
  AND status = 'pending'
  AND rejection_reason IS NULL
  AND expiration_date IS NULL
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND approved_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'provider'
  )
  )
);

-- Restrict legacy Pro UPDATE policies without replacing the Admin UPDATE policy.
-- Admin must still pass its existing permissive policy; this grants nothing alone.
DROP POLICY IF EXISTS provider_documents_admin_update_guard ON public.provider_documents;
CREATE POLICY provider_documents_admin_update_guard
ON public.provider_documents AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_admin_permission('providers')
)
WITH CHECK (
  public.has_admin_permission('providers')
);

DROP POLICY IF EXISTS provider_document_requests_pro_submit ON public.provider_document_requests;
CREATE POLICY provider_document_requests_pro_submit
ON public.provider_document_requests FOR UPDATE TO authenticated
USING (provider_id = auth.uid() AND status IN ('pending', 'submitted'))
WITH CHECK (provider_id = auth.uid() AND status = 'submitted');

-- Keep Admin INSERT/UPDATE/DELETE policies intact. Old Pro UPDATE policies
-- cannot bypass this ownership and state guard. The trigger checks columns.
DROP POLICY IF EXISTS provider_document_requests_submit_guard ON public.provider_document_requests;
CREATE POLICY provider_document_requests_submit_guard
ON public.provider_document_requests AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_admin_permission('providers')
  OR (provider_id = auth.uid() AND status IN ('pending', 'submitted'))
)
WITH CHECK (
  public.has_admin_permission('providers')
  OR (provider_id = auth.uid() AND status = 'submitted')
);

-- SECURITY DEFINER reads the authoritative Pro session record and Admin permission
-- without granting clients access to it. No writes, dynamic SQL or session flags.
CREATE OR REPLACE FUNCTION public.guard_provider_document_pro_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- Only the trusted platform service role may bypass the client guards.
  -- NULL, anon and other roles are not backend authorization.
  -- Never use current_user here: SECURITY DEFINER changes that identity.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'An authenticated professional or authorized backend is required'
      USING ERRCODE = '42501';
  END IF;

  -- Admin INSERT and UPDATE remain subject to existing policies/grants.
  IF public.has_admin_permission('providers') THEN
    RETURN NEW;
  END IF;

  -- Active means the JWT session matches provider_active_sessions, not that
  -- provider_profiles.active is true: Pros under review must still upload.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.provider_active_sessions s ON s.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.role = 'provider'
      AND s.session_id::text = (auth.jwt() ->> 'session_id')
  ) THEN
    RAISE EXCEPTION 'An active professional session is required'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.provider_id IS DISTINCT FROM auth.uid()
       OR NEW.provider_id IS DISTINCT FROM auth.uid()
       OR OLD.status IS NULL
       OR OLD.status NOT IN ('pending', 'submitted')
       OR NEW.status IS DISTINCT FROM 'submitted'
       OR (to_jsonb(NEW) - ARRAY['status', 'submitted_at', 'updated_at'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['status', 'submitted_at', 'updated_at'])
    THEN
      RAISE EXCEPTION 'Professionals may only submit their own pending/submitted requests and change status, submitted_at, updated_at'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_provider_document_pro_writes()
FROM PUBLIC, anon, authenticated;

-- INSERT values/ownership are enforced by RLS; the trigger adds session checks.
DROP TRIGGER IF EXISTS provider_documents_pro_insert_guard ON public.provider_documents;
CREATE TRIGGER provider_documents_pro_insert_guard
BEFORE INSERT ON public.provider_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_document_pro_writes();

-- AFTER sees final values after any BEFORE trigger and raises to roll back an
-- invalid change. Full-row JSONB comparison includes NULLs and future columns.
DROP TRIGGER IF EXISTS provider_document_requests_pro_update_guard ON public.provider_document_requests;
CREATE TRIGGER provider_document_requests_pro_update_guard
AFTER UPDATE ON public.provider_document_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_document_pro_writes();

COMMIT;
