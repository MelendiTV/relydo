-- Applied in RELYDO TEST on 2026-10-02 (operator-reported); do not reapply in TEST. Production pending.
-- No PII, report payloads or invitation bearer URLs.
BEGIN;
CREATE TABLE public.provider_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  package_slug text NOT NULL,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','disputed')),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  payment_started_at timestamptz,
  paid_at timestamptz,
  candidate_key uuid NOT NULL DEFAULT gen_random_uuid(),
  invitation_key uuid NOT NULL DEFAULT gen_random_uuid(),
  checkr_started_at timestamptz,
  checkr_candidate_id text UNIQUE,
  checkr_invitation_id text UNIQUE,
  checkr_report_id text UNIQUE,
  invitation_status text,
  background_status text NOT NULL DEFAULT 'pending' CHECK (background_status IN ('pending','clear','consider')),
  identity_status text NOT NULL DEFAULT 'pending' CHECK (identity_status IN ('pending','verified','unverified')),
  decision_state text NOT NULL DEFAULT 'blocked' CHECK (decision_state IN ('blocked','eligible','human_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.provider_screening_events (
  event_id text PRIMARY KEY,
  screening_id uuid NOT NULL REFERENCES public.provider_screenings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_screening_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_screenings, public.provider_screening_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provider_screenings, public.provider_screening_events TO service_role;

-- Atomic event-ID dedupe. Each delivery retrieves current state, not event payload state.
CREATE FUNCTION public.apply_provider_screening_event(p_id uuid, p_event text, p_type text, p_at timestamptz, p_report text, p_invitation_status text, p_background text, p_identity text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.provider_screenings WHERE id = p_id FOR UPDATE;
  IF p_report IS NOT NULL AND EXISTS (SELECT 1 FROM public.provider_screenings WHERE id=p_id AND checkr_report_id IS NOT NULL AND checkr_report_id <> p_report) THEN
    RAISE EXCEPTION 'Report mismatch';
  END IF;
  INSERT INTO public.provider_screening_events(event_id,screening_id,event_type) VALUES(p_event,p_id,p_type) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.provider_screenings SET
    checkr_report_id = coalesce(p_report,checkr_report_id),
    invitation_status = coalesce(p_invitation_status,invitation_status),
    background_status = coalesce(p_background,background_status),
    identity_status = coalesce(p_identity,identity_status),
    decision_state = CASE WHEN payment_status <> 'paid' THEN 'blocked'
      WHEN coalesce(p_background,background_status) = 'consider' THEN 'human_review'
      WHEN coalesce(p_background,background_status) = 'clear' AND coalesce(p_identity,identity_status) = 'verified' THEN 'eligible' ELSE 'blocked' END,
    updated_at = now()
  WHERE id = p_id AND (p_report IS NULL OR checkr_report_id IS NULL OR checkr_report_id = p_report);
END $$;
REVOKE ALL ON FUNCTION public.apply_provider_screening_event(uuid,text,text,timestamptz,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_screening_event(uuid,text,text,timestamptz,text,text,text,text) TO service_role;

-- PostgreSQL cannot read application environment: synchronize this protected flag.
-- Never replace/disable live protect_provider_profile_privileged_fields.
CREATE TABLE public.provider_screening_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.provider_screening_settings(singleton,enabled) VALUES(true,false);
ALTER TABLE public.provider_screening_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_screening_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.provider_screening_settings TO service_role;
-- Close direct profile-write/legacy-route bypasses as well as the API gate.
-- Existing approved rows stay untouched; every future activation must pass.
CREATE FUNCTION public.guard_provider_screening_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.provider_screening_settings WHERE singleton AND enabled) THEN RETURN NEW; END IF;
  IF (NEW.verified IS TRUE OR NEW.active IS TRUE OR NEW.verification_status = 'verified') AND NOT EXISTS (
    SELECT 1 FROM public.provider_screenings s WHERE s.provider_id = NEW.user_id
    AND s.payment_status = 'paid' AND s.background_status = 'clear'
    AND s.identity_status = 'verified' AND s.decision_state = 'eligible'
  ) THEN RAISE EXCEPTION 'Paid background and identity screening required' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_provider_screening_approval() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER provider_screening_approval_guard AFTER INSERT OR UPDATE OF verified,active,verification_status ON public.provider_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_provider_screening_approval();
COMMIT;
