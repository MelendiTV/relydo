-- Phase 1 only: no awards, release hooks, checkout changes or balance spending.
BEGIN;
CREATE TABLE public.customer_referral_codes (
 customer_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 code text NOT NULL UNIQUE CHECK (code ~ '^REL-[A-HJ-NP-Z2-9]{10}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id, code)
);
CREATE TABLE public.customer_referrals (
 referred_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 referrer_id uuid NOT NULL,
 code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (referred_id <> referrer_id),
 FOREIGN KEY(referrer_id, code) REFERENCES public.customer_referral_codes(customer_id, code)
);
-- Dedicated promotional ledger. Credit never expires and is not cash/transferable.
-- A future release handler must verify the first paid real job, no refund/dispute,
-- and Pro release before inserting BOTH awards transactionally. No writer in phase 1.
CREATE TABLE public.referral_credit_ledger (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 referral_id uuid NOT NULL REFERENCES public.customer_referrals(referred_id),
 beneficiary_id uuid NOT NULL REFERENCES public.profiles(id),
 award_kind text NOT NULL CHECK (award_kind IN ('referrer','referred')),
 amount_cents integer NOT NULL CHECK (amount_cents = 1500),
 currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(referral_id, award_kind),
 UNIQUE(referral_id, beneficiary_id)
);
CREATE FUNCTION public.referral_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Referral records are immutable'; END $$;
CREATE TRIGGER referral_code_immutable BEFORE UPDATE ON public.customer_referral_codes
 FOR EACH ROW EXECUTE FUNCTION public.referral_immutable();
CREATE TRIGGER referral_relation_immutable BEFORE UPDATE ON public.customer_referrals
 FOR EACH ROW EXECUTE FUNCTION public.referral_immutable();
CREATE TRIGGER referral_ledger_immutable BEFORE UPDATE OR DELETE ON public.referral_credit_ledger
 FOR EACH ROW EXECUTE FUNCTION public.referral_immutable();
CREATE FUNCTION public.referral_ledger_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.customer_referrals;
BEGIN
 SELECT * INTO STRICT r FROM public.customer_referrals WHERE referred_id = NEW.referral_id;
 IF NEW.beneficiary_id <> (CASE NEW.award_kind WHEN 'referrer' THEN r.referrer_id ELSE r.referred_id END) THEN
  RAISE EXCEPTION 'Invalid referral beneficiary';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER referral_ledger_beneficiary BEFORE INSERT ON public.referral_credit_ledger
 FOR EACH ROW EXECUTE FUNCTION public.referral_ledger_guard();
CREATE FUNCTION public.ensure_customer_referral_code(p_customer_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result text; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; attempt integer; i integer;
BEGIN
 PERFORM 1 FROM public.profiles WHERE id = p_customer_id AND role = 'customer' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer required'; END IF;
 SELECT code INTO result FROM public.customer_referral_codes WHERE customer_id = p_customer_id;
 IF FOUND THEN RETURN result; END IF;
 FOR attempt IN 1..32 LOOP
  result := 'REL-';
  FOR i IN 1..10 LOOP result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::integer, 1); END LOOP;
  INSERT INTO public.customer_referral_codes(customer_id,code) VALUES(p_customer_id,result)
   ON CONFLICT (code) DO NOTHING;
  IF FOUND THEN RETURN result; END IF;
 END LOOP;
 RAISE EXCEPTION 'Referral code generation exhausted';
END $$;
CREATE FUNCTION public.my_customer_referral_code() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.ensure_customer_referral_code(auth.uid());
$$;
CREATE FUNCTION public.validate_customer_referral_code(p_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE WHEN coalesce(trim(p_code),'') = '' THEN true ELSE EXISTS (
  SELECT 1 FROM public.customer_referral_codes c JOIN public.profiles p ON p.id=c.customer_id
  WHERE c.code = upper(trim(p_code)) AND p.role='customer'
 ) END;
$$;
CREATE FUNCTION public.capture_customer_referral() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE supplied text; owner_id uuid;
BEGIN
 IF NEW.role <> 'customer' THEN RETURN NEW; END IF;
 SELECT upper(trim(raw_user_meta_data->>'referral_code')) INTO supplied FROM auth.users WHERE id = NEW.id;
 IF coalesce(supplied,'') <> '' THEN
  SELECT c.customer_id INTO owner_id FROM public.customer_referral_codes c
   JOIN public.profiles p ON p.id=c.customer_id WHERE c.code=supplied AND p.role='customer';
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  IF owner_id = NEW.id THEN RAISE EXCEPTION 'Self referral forbidden'; END IF;
  INSERT INTO public.customer_referrals(referred_id,referrer_id,code) VALUES(NEW.id,owner_id,supplied);
 END IF;
 PERFORM public.ensure_customer_referral_code(NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER capture_customer_referral AFTER INSERT ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.capture_customer_referral();
ALTER TABLE public.customer_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_credit_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_referral_codes, public.customer_referrals, public.referral_credit_ledger FROM anon,authenticated;
GRANT SELECT ON public.customer_referral_codes, public.customer_referrals, public.referral_credit_ledger TO authenticated;
CREATE POLICY referral_code_owner ON public.customer_referral_codes FOR SELECT TO authenticated USING(customer_id=auth.uid());
CREATE POLICY referral_relationship_owner ON public.customer_referrals FOR SELECT TO authenticated USING(referred_id=auth.uid() OR referrer_id=auth.uid());
CREATE POLICY referral_credit_owner ON public.referral_credit_ledger FOR SELECT TO authenticated USING(beneficiary_id=auth.uid());
REVOKE ALL ON FUNCTION public.ensure_customer_referral_code(uuid), public.capture_customer_referral(), public.referral_immutable(), public.referral_ledger_guard(), public.my_customer_referral_code(), public.validate_customer_referral_code(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_customer_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customer_referral_code(text) TO anon,authenticated;
COMMIT;
