-- Local proposal. No historical backfill. Bonuses use RELYDO balance, not customer charges.
BEGIN;
CREATE TABLE public.provider_referral_pending (
 request_id uuid PRIMARY KEY REFERENCES public.service_requests(id),
 last_attempt_at timestamptz, finished_at timestamptz
);
CREATE TABLE public.provider_referral_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 credit_id bigint NOT NULL UNIQUE REFERENCES public.provider_referral_credit_ledger(id),
 request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id),
 beneficiary_id uuid NOT NULL REFERENCES public.profiles(id),
 destination text NOT NULL CHECK(destination ~ '^acct_[A-Za-z0-9]+$'),
 amount_cents integer NOT NULL DEFAULT 2500 CHECK(amount_cents=2500),
 currency text NOT NULL DEFAULT 'usd' CHECK(currency='usd'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 receipt jsonb, confirmed_at timestamptz,
 CHECK((receipt IS NULL)=(confirmed_at IS NULL))
);
ALTER TABLE public.provider_referral_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_referral_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_referral_pending,public.provider_referral_redemptions FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX provider_referral_transfer_unique ON public.provider_referral_redemptions((receipt->>'id')) WHERE receipt IS NOT NULL;
CREATE INDEX provider_referral_credit_owner ON public.provider_referral_credit_ledger(beneficiary_id,id);
CREATE INDEX provider_referral_first_job ON public.service_requests(preferred_provider_id,created_at,id) WHERE status='completed';

-- Shared local eligibility + exact fresh Stripe observations of every release step.
-- Caller locks parent first. Only a financially eligible release earns the award;
-- ineligible requests leave it pending. Payments/COs never count as jobs.
CREATE FUNCTION public.provider_referral_release_valid(p_request_id uuid,p_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.service_requests%rowtype; s public.job_financial_steps%rowtype; e jsonb; n integer;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO j FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 IF j.status IS DISTINCT FROM 'completed' OR j.preferred_provider_id IS NULL
  OR j.preferred_provider_id=j.customer_id
  OR EXISTS(SELECT 1 FROM public.job_claims WHERE request_id=j.id)
  OR EXISTS(SELECT 1 FROM public.payment_reassignments WHERE request_id=j.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=j.preferred_provider_id AND role='provider')
  OR NOT EXISTS(SELECT 1 FROM public.provider_profiles WHERE user_id=j.preferred_provider_id
    AND verified IS TRUE AND verification_status='verified')
 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id
   AND p.provider_id=j.preferred_provider_id AND p.status='paid_out'
   AND p.released_at IS NOT NULL AND coalesce(p.stripe_transfer_id,'')<>''
   AND p.provider_net_amount>0 AND p.customer_total_amount>0 AND p.paid_at IS NOT NULL
   AND lower(p.currency)='usd')
  OR EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id AND (
   coalesce((to_jsonb(p)->>'refunded_amount')::numeric,0)>0
   OR to_jsonb(p)->>'stripe_refund_id' IS NOT NULL OR to_jsonb(p)->>'refunded_at' IS NOT NULL
   OR p.status IN ('refunded','partially_refunded','disputed')))
  OR EXISTS(SELECT 1 FROM public.change_orders c WHERE c.request_id=j.id AND (
   coalesce(c.refunded_amount,0)>0 OR c.stripe_refund_id IS NOT NULL OR c.refunded_at IS NOT NULL))
 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_financial_resolutions WHERE request_id=j.id
   AND owner='automatic_release' AND plan IS NOT NULL AND state IN ('reserved','executing','settled'))
 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id AND p.status='paid_out'
   AND NOT EXISTS(SELECT 1 FROM public.job_financial_steps step WHERE step.request_id=j.id AND step.receipt->>'id'=p.stripe_transfer_id))
  OR EXISTS(SELECT 1 FROM public.change_orders c WHERE c.request_id=j.id AND c.payment_status='paid' AND (
   c.released_at IS NULL OR c.stripe_transfer_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.job_financial_steps step WHERE step.request_id=j.id AND step.receipt->>'id'=c.stripe_transfer_id)))
 THEN RETURN false; END IF;
 IF p_evidence IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PRO_REFERRAL_EVIDENCE_REQUIRED'; END IF;
 SELECT count(*) INTO n FROM public.job_financial_steps WHERE request_id=j.id;
 IF n=0 OR jsonb_array_length(p_evidence)<>n THEN RAISE EXCEPTION 'PRO_REFERRAL_EVIDENCE_INCOMPLETE'; END IF;
 FOR s IN SELECT * FROM public.job_financial_steps WHERE request_id=j.id LOOP
  SELECT value INTO e FROM jsonb_array_elements(p_evidence) WHERE value->>'transfer_id'=s.receipt->>'id';
  IF s.kind<>'transfer' OR s.receipt->>'status' IS DISTINCT FROM 'succeeded'
   OR s.confirmed_at IS NULL OR s.receipt->>'direction' IS DISTINCT FROM 'to_provider'
   OR s.receipt->>'currency' IS DISTINCT FROM 'usd'
   OR s.receipt->>'source' IS NULL OR e IS NULL
   OR e->>'charge_id' IS DISTINCT FROM s.charge_id
   OR e->>'payment_intent_id' IS DISTINCT FROM s.receipt#>>'{source,paymentIntentId}'
   OR e->>'destination' IS DISTINCT FROM s.receipt->>'destination'
   OR (e->>'amount')::numeric IS DISTINCT FROM (s.receipt->>'amount')::numeric
   OR e->>'currency' IS DISTINCT FROM 'usd'
   OR e->>'paid' IS DISTINCT FROM 'true' OR e->>'disputed' IS DISTINCT FROM 'false'
   OR e->>'refunded' IS DISTINCT FROM 'false' OR e->>'has_refunds' IS DISTINCT FROM 'false'
   OR (e->>'amount_refunded')::numeric IS DISTINCT FROM 0
   OR e->>'reversed' IS DISTINCT FROM 'false' OR (e->>'amount_reversed')::numeric IS DISTINCT FROM 0
   OR (e->>'observed_at')::timestamptz IS NULL
   OR (e->>'observed_at')::timestamptz < clock_timestamp()-interval '5 minutes'
   OR (e->>'observed_at')::timestamptz > clock_timestamp()+interval '30 seconds'
  THEN RAISE EXCEPTION 'PRO_REFERRAL_EVIDENCE_MISMATCH'; END IF;
 END LOOP;
 -- Existing settlement verifies every receipt against the complete immutable plan.
 IF (public.settle_job_financial_resolution(j.id,'automatic_release')->>'settled')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PRO_REFERRAL_RELEASE_INCOMPLETE'; END IF;

 RETURN true;
END $$;

CREATE FUNCTION public.award_provider_referral(p_request_id uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.service_requests%rowtype; r public.provider_referrals%rowtype; n integer;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO j FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=j.preferred_provider_id FOR UPDATE NOWAIT;
 SELECT * INTO r FROM public.provider_referrals WHERE referred_id=j.preferred_provider_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_referred'); END IF;
 SELECT count(*) INTO n FROM public.provider_referral_credit_ledger WHERE referral_id=r.referred_id;
 IF n=2 THEN RETURN jsonb_build_object('outcome','already_awarded'); END IF;
 IF n<>0 THEN RAISE EXCEPTION 'PRO_REFERRAL_PARTIAL_LEDGER'; END IF;
 IF j.created_at IS NULL OR j.created_at<r.created_at OR j.customer_id IN(r.referrer_id,r.referred_id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.referrer_id AND role='provider')
  OR NOT public.provider_referral_release_valid(j.id,p_evidence)
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF p_evidence IS NULL THEN RETURN jsonb_build_object('outcome','needs_evidence'); END IF;
 INSERT INTO public.provider_referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents,qualifying_request_id)
 VALUES(r.referred_id,r.referrer_id,'referrer',2500,j.id),(r.referred_id,r.referred_id,'referred',2500,j.id);
 RETURN jsonb_build_object('outcome','awarded');
END $$;

CREATE FUNCTION public.reserve_provider_referral_bonus(p_request_id uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.service_requests%rowtype; d public.provider_referral_redemptions%rowtype; credit bigint; account text; beneficiary uuid;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT * INTO j FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=j.preferred_provider_id FOR UPDATE NOWAIT;
 -- Existing instructions never change/release on timeout, failure or account edits.
 SELECT * INTO d FROM public.provider_referral_redemptions WHERE request_id=j.id FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('outcome','reserved','redemption',to_jsonb(d)); END IF;
 -- A is paid on B's qualifying release; B only on a later eligible release.
 SELECT l.id,l.beneficiary_id INTO credit,beneficiary FROM public.provider_referral_credit_ledger l
 JOIN public.provider_referrals r ON r.referred_id=l.referral_id
 WHERE NOT EXISTS(SELECT 1 FROM public.provider_referral_redemptions spent WHERE spent.credit_id=l.id)
 AND ((l.award_kind='referrer' AND l.qualifying_request_id=j.id)
 OR (l.award_kind='referred' AND l.beneficiary_id=j.preferred_provider_id
  AND l.qualifying_request_id<>j.id AND j.created_at>=r.created_at
  AND j.customer_id NOT IN(r.referrer_id,r.referred_id)
  AND EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id AND p.released_at>l.created_at)))
 ORDER BY (l.award_kind='referrer') DESC,l.id LIMIT 1 FOR UPDATE OF l NOWAIT;
 IF credit IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.provider_referrals r WHERE r.referred_id=j.preferred_provider_id
    AND NOT EXISTS(SELECT 1 FROM public.provider_referral_credit_ledger WHERE referral_id=r.referred_id)) THEN
   UPDATE public.provider_referral_pending SET finished_at=clock_timestamp() WHERE request_id=j.id;
  END IF;
  RETURN jsonb_build_object('outcome','no_credit');
 END IF;
 -- An old released job cannot absorb a newly earned referral credit.
 IF NOT EXISTS(SELECT 1 FROM public.provider_referral_credit_ledger l JOIN public.payments p ON p.request_id=j.id
   WHERE l.id=credit AND (p.released_at>=l.created_at OR l.qualifying_request_id=j.id))
  OR NOT public.provider_referral_release_valid(j.id,p_evidence)
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF p_evidence IS NULL THEN RETURN jsonb_build_object('outcome','needs_evidence'); END IF;
 SELECT stripe_account_id INTO account FROM public.provider_profiles WHERE user_id=beneficiary;
 IF coalesce(account,'') !~ '^acct_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'PRO_REFERRAL_ACCOUNT_REQUIRED'; END IF;
 INSERT INTO public.provider_referral_redemptions(credit_id,request_id,beneficiary_id,destination)
 VALUES(credit,j.id,beneficiary,account) RETURNING * INTO d;
 RETURN jsonb_build_object('outcome','reserved','redemption',to_jsonb(d));
END $$;

CREATE FUNCTION public.authorize_provider_referral_bonus(p_redemption_id uuid,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.provider_referral_redemptions%rowtype; job uuid;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT request_id INTO job FROM public.provider_referral_redemptions WHERE id=p_redemption_id;
 PERFORM 1 FROM public.service_requests WHERE id=job FOR UPDATE;
 SELECT * INTO d FROM public.provider_referral_redemptions WHERE id=p_redemption_id FOR UPDATE;
 IF NOT FOUND OR p_evidence IS NULL THEN RAISE EXCEPTION 'PRO_REFERRAL_EVIDENCE_REQUIRED'; END IF;
 RETURN jsonb_build_object('allowed',d.receipt IS NULL
  AND EXISTS(SELECT 1 FROM public.provider_referral_credit_ledger l
   WHERE l.id=d.credit_id AND l.beneficiary_id=d.beneficiary_id
   AND ((l.award_kind='referrer' AND l.qualifying_request_id=d.request_id)
    OR (l.award_kind='referred' AND l.qualifying_request_id<>d.request_id
     AND EXISTS(SELECT 1 FROM public.service_requests WHERE id=d.request_id AND preferred_provider_id=d.beneficiary_id))))
  AND EXISTS(SELECT 1 FROM public.provider_profiles WHERE user_id=d.beneficiary_id AND stripe_account_id=d.destination)
  AND public.provider_referral_release_valid(d.request_id,p_evidence));
END $$;

CREATE FUNCTION public.record_provider_referral_bonus(p_redemption_id uuid,p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.provider_referral_redemptions%rowtype; job uuid;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 SELECT request_id INTO job FROM public.provider_referral_redemptions WHERE id=p_redemption_id;
 PERFORM 1 FROM public.service_requests WHERE id=job FOR UPDATE;
 SELECT * INTO d FROM public.provider_referral_redemptions WHERE id=p_redemption_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRO_REFERRAL_RESERVATION_REQUIRED'; END IF;
 IF d.receipt IS NOT NULL THEN
  IF d.receipt IS DISTINCT FROM p_receipt THEN RAISE EXCEPTION 'PRO_REFERRAL_RECEIPT_CONFLICT'; END IF;
  RETURN jsonb_build_object('recorded',true);
 END IF;
 IF coalesce(p_receipt->>'id','') !~ '^tr_[A-Za-z0-9]+$'
  OR (p_receipt->>'amount')::integer IS DISTINCT FROM 2500
  OR p_receipt->>'currency' IS DISTINCT FROM 'usd'
  OR p_receipt->>'destination' IS DISTINCT FROM d.destination
  OR p_receipt->>'source_transaction' IS NOT NULL
  OR p_receipt->>'transfer_group' IS DISTINCT FROM 'relydo_pro_bonus_'||d.id::text
  OR p_receipt#>>'{metadata,provider_referral_redemption_id}' IS DISTINCT FROM d.id::text
  OR p_receipt->>'reversed' IS DISTINCT FROM 'false'
  OR (p_receipt->>'amount_reversed')::integer IS DISTINCT FROM 0
 THEN RAISE EXCEPTION 'PRO_REFERRAL_RECEIPT_MISMATCH'; END IF;
 UPDATE public.provider_referral_redemptions SET receipt=p_receipt,confirmed_at=clock_timestamp() WHERE id=d.id;
 UPDATE public.provider_referral_pending SET finished_at=clock_timestamp() WHERE request_id=d.request_id;
 RETURN jsonb_build_object('recorded',true);
END $$;

CREATE FUNCTION public.queue_provider_referral() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='paid_out' AND NEW.released_at IS NOT NULL AND (
  EXISTS(SELECT 1 FROM public.provider_referrals WHERE referred_id=NEW.provider_id)
  OR EXISTS(SELECT 1 FROM public.provider_referral_credit_ledger WHERE beneficiary_id=NEW.provider_id)
 ) THEN
  INSERT INTO public.provider_referral_pending(request_id) VALUES(NEW.request_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_provider_referral AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.queue_provider_referral();
CREATE FUNCTION public.pending_provider_referrals() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 RETURN QUERY WITH pending AS (
  SELECT request_id FROM public.provider_referral_pending WHERE finished_at IS NULL
  ORDER BY last_attempt_at NULLS FIRST,request_id LIMIT 25 FOR UPDATE SKIP LOCKED
 ) UPDATE public.provider_referral_pending q SET last_attempt_at=clock_timestamp()
 FROM pending WHERE q.request_id=pending.request_id RETURNING q.request_id;
END $$;
REVOKE ALL ON FUNCTION public.provider_referral_release_valid(uuid,jsonb),public.award_provider_referral(uuid,jsonb),public.reserve_provider_referral_bonus(uuid,jsonb),public.authorize_provider_referral_bonus(uuid,jsonb),public.record_provider_referral_bonus(uuid,jsonb),public.queue_provider_referral(),public.pending_provider_referrals() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.award_provider_referral(uuid,jsonb),public.reserve_provider_referral_bonus(uuid,jsonb),public.authorize_provider_referral_bonus(uuid,jsonb),public.record_provider_referral_bonus(uuid,jsonb),public.pending_provider_referrals() TO service_role;
CREATE FUNCTION public.my_provider_referral_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid:=auth.uid(); code text;
BEGIN
 code:=public.ensure_provider_referral_code(owner_id);
 RETURN jsonb_build_object('code',code,'available_cents',(
  SELECT coalesce(sum(l.amount_cents),0) FROM public.provider_referral_credit_ledger l WHERE beneficiary_id=owner_id
   AND NOT EXISTS(SELECT 1 FROM public.provider_referral_redemptions d WHERE d.credit_id=l.id)),
  'reserved_cents',(SELECT coalesce(sum(amount_cents),0) FROM public.provider_referral_redemptions WHERE beneficiary_id=owner_id AND receipt IS NULL),
  'paid_cents',(SELECT coalesce(sum(amount_cents),0) FROM public.provider_referral_redemptions WHERE beneficiary_id=owner_id AND receipt IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.my_provider_referral_summary() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.my_provider_referral_summary() TO authenticated;
COMMIT;
