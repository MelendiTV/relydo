-- Local proposal: separate Pro referral attribution and immutable $25 awards.
BEGIN;
CREATE TABLE public.provider_referral_codes (
 provider_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 code text NOT NULL UNIQUE CHECK (code ~ '^PRO-[A-HJ-NP-Z2-9]{10}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_id, code)
);
CREATE TABLE public.provider_referrals (
 referred_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 referrer_id uuid NOT NULL,
 code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (referred_id <> referrer_id),
 FOREIGN KEY(referrer_id, code) REFERENCES public.provider_referral_codes(provider_id, code)
);
-- Pro credit is separate from all customer promotions.
CREATE TABLE public.provider_referral_credit_ledger (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 referral_id uuid NOT NULL REFERENCES public.provider_referrals(referred_id),
 beneficiary_id uuid NOT NULL REFERENCES public.profiles(id),
 award_kind text NOT NULL CHECK (award_kind IN ('referrer','referred')),
 amount_cents integer NOT NULL CHECK (amount_cents = 2500),
 currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
 qualifying_request_id uuid NOT NULL REFERENCES public.service_requests(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(referral_id, award_kind),
 UNIQUE(referral_id, beneficiary_id)
);
CREATE FUNCTION public.provider_referral_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Referral records are immutable'; END $$;
CREATE TRIGGER provider_referral_code_immutable BEFORE UPDATE OR DELETE ON public.provider_referral_codes
 FOR EACH ROW EXECUTE FUNCTION public.provider_referral_immutable();
CREATE TRIGGER provider_referral_relation_immutable BEFORE UPDATE OR DELETE ON public.provider_referrals
 FOR EACH ROW EXECUTE FUNCTION public.provider_referral_immutable();
CREATE TRIGGER provider_referral_ledger_immutable BEFORE UPDATE OR DELETE ON public.provider_referral_credit_ledger
 FOR EACH ROW EXECUTE FUNCTION public.provider_referral_immutable();
CREATE FUNCTION public.provider_referral_ledger_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.provider_referrals;
BEGIN
 SELECT * INTO STRICT r FROM public.provider_referrals WHERE referred_id = NEW.referral_id;
 IF NEW.beneficiary_id <> (CASE NEW.award_kind WHEN 'referrer' THEN r.referrer_id ELSE r.referred_id END) THEN
  RAISE EXCEPTION 'Invalid referral beneficiary';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_referral_ledger_beneficiary BEFORE INSERT ON public.provider_referral_credit_ledger
 FOR EACH ROW EXECUTE FUNCTION public.provider_referral_ledger_guard();
CREATE FUNCTION public.ensure_provider_referral_code(p_provider_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result text; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; attempt integer; i integer;
BEGIN
 PERFORM 1 FROM public.profiles WHERE id = p_provider_id AND role = 'provider' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Provider required'; END IF;
 SELECT code INTO result FROM public.provider_referral_codes WHERE provider_id = p_provider_id;
 IF FOUND THEN RETURN result; END IF;
 FOR attempt IN 1..32 LOOP
  result := 'PRO-';
  FOR i IN 1..10 LOOP result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::integer, 1); END LOOP;
  INSERT INTO public.provider_referral_codes(provider_id,code) VALUES(p_provider_id,result)
   ON CONFLICT (code) DO NOTHING;
  IF FOUND THEN RETURN result; END IF;
 END LOOP;
 RAISE EXCEPTION 'Referral code generation exhausted';
END $$;
CREATE FUNCTION public.my_provider_referral_code() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.ensure_provider_referral_code(auth.uid());
$$;
CREATE FUNCTION public.validate_provider_referral_code(p_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE WHEN coalesce(trim(p_code),'') = '' THEN true ELSE EXISTS (
  SELECT 1 FROM public.provider_referral_codes c JOIN public.profiles p ON p.id=c.provider_id
  WHERE c.code = upper(trim(p_code)) AND p.role='provider'
 ) END;
$$;
CREATE FUNCTION public.capture_provider_referral() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supplied text; owner_id uuid;
BEGIN
 IF NEW.role <> 'provider' THEN RETURN NEW; END IF;
 SELECT upper(trim(raw_user_meta_data->>'provider_referral_code')) INTO supplied FROM auth.users WHERE id = NEW.id;
 IF coalesce(supplied,'') <> '' THEN
  SELECT c.provider_id INTO owner_id FROM public.provider_referral_codes c
   JOIN public.profiles p ON p.id=c.provider_id WHERE c.code=supplied AND p.role='provider';
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  IF owner_id = NEW.id THEN RAISE EXCEPTION 'Self referral forbidden'; END IF;
  INSERT INTO public.provider_referrals(referred_id,referrer_id,code) VALUES(NEW.id,owner_id,supplied);
 END IF;
 PERFORM public.ensure_provider_referral_code(NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER capture_provider_referral AFTER INSERT ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.capture_provider_referral();
ALTER TABLE public.provider_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_referral_credit_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_referral_codes, public.provider_referrals, public.provider_referral_credit_ledger FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.provider_referral_codes, public.provider_referrals, public.provider_referral_credit_ledger TO authenticated;
CREATE POLICY referral_code_owner ON public.provider_referral_codes FOR SELECT TO authenticated USING(provider_id=auth.uid());
CREATE POLICY referral_relationship_owner ON public.provider_referrals FOR SELECT TO authenticated USING(referred_id=auth.uid() OR referrer_id=auth.uid());
CREATE POLICY referral_credit_owner ON public.provider_referral_credit_ledger FOR SELECT TO authenticated USING(beneficiary_id=auth.uid());
REVOKE ALL ON FUNCTION public.ensure_provider_referral_code(uuid), public.capture_provider_referral(), public.provider_referral_immutable(), public.provider_referral_ledger_guard(), public.my_provider_referral_code(), public.validate_provider_referral_code(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.my_provider_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_provider_referral_code(text) TO anon,authenticated;
REVOKE ALL ON public.provider_referral_codes,public.provider_referrals,public.provider_referral_credit_ledger FROM service_role;
COMMIT;
