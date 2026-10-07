-- Phase 2 correction only: keep the original applied migration unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.award_customer_referral(p_request_id uuid, p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 j public.service_requests%rowtype;
 r public.customer_referrals%rowtype;
 s public.job_financial_steps%rowtype;
 e jsonb;
 n integer;
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED'; END IF;
 -- Same parent-first lock order as financial writers. Serialize different jobs
 -- for one referred customer; NOWAIT avoids cross-job lock inversions on retry.
 SELECT * INTO j FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 SELECT * INTO r FROM public.customer_referrals WHERE referred_id=j.customer_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','not_referred'); END IF;
 SELECT count(*) INTO n FROM public.referral_credit_ledger WHERE referral_id=r.referred_id;
 IF n=2 AND NOT EXISTS(SELECT 1 FROM public.referral_credit_ledger WHERE referral_id=r.referred_id
   AND qualifying_request_id IS NULL) THEN
  UPDATE public.customer_referral_award_pending SET finished_at=clock_timestamp() WHERE request_id=j.id;
  RETURN jsonb_build_object('outcome','already_awarded');
 END IF;
 IF n<>0 THEN RAISE EXCEPTION 'REFERRAL_PARTIAL_LEDGER_REQUIRES_RECONCILIATION'; END IF;
 -- Choose the first distinct request before checking financial eligibility.
 -- Earlier requests (including pre-referral and failed/refunded jobs) consume
 -- the first-job opportunity. Payments/change orders never define job order.
 -- UUID breaks equal creation timestamps deterministically.
 IF j.created_at IS NULL OR j.created_at < r.created_at
  OR EXISTS(SELECT 1 FROM public.service_requests prior
   WHERE prior.customer_id=r.referred_id AND prior.id<>j.id
    AND (prior.created_at IS NULL
     OR (prior.created_at,prior.id) < (j.created_at,j.id)))
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF j.status IS DISTINCT FROM 'completed' OR j.preferred_provider_id IS NULL
  OR j.preferred_provider_id IN (r.referred_id,r.referrer_id)
  OR EXISTS(SELECT 1 FROM public.job_claims WHERE request_id=j.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.referred_id AND role='customer')
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.referrer_id AND role='customer')
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id
   AND p.provider_id=j.preferred_provider_id AND p.status='paid_out'
   AND p.released_at IS NOT NULL AND coalesce(p.stripe_transfer_id,'')<>''
   AND p.provider_net_amount>0 AND p.customer_total_amount>0 AND p.paid_at>=r.created_at
   AND lower(p.currency)='usd')
  OR EXISTS(SELECT 1 FROM public.payments p WHERE p.request_id=j.id AND (
   coalesce((to_jsonb(p)->>'refunded_amount')::numeric,0)>0
   OR to_jsonb(p)->>'stripe_refund_id' IS NOT NULL OR to_jsonb(p)->>'refunded_at' IS NOT NULL
   OR p.status IN ('refunded','partially_refunded','disputed')))
  OR EXISTS(SELECT 1 FROM public.change_orders c WHERE c.request_id=j.id AND (
   coalesce(c.refunded_amount,0)>0 OR c.stripe_refund_id IS NOT NULL OR c.refunded_at IS NOT NULL))
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_financial_resolutions WHERE request_id=j.id
   AND owner='automatic_release' AND plan IS NOT NULL AND state IN ('reserved','executing','settled'))
 THEN RETURN jsonb_build_object('outcome','ineligible'); END IF;
 IF p_evidence IS NULL THEN RETURN jsonb_build_object('outcome','needs_evidence'); END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'REFERRAL_EVIDENCE_REQUIRED'; END IF;
 SELECT count(*) INTO n FROM public.job_financial_steps WHERE request_id=j.id;
 IF n=0 OR jsonb_array_length(p_evidence)<>n THEN RAISE EXCEPTION 'REFERRAL_EVIDENCE_INCOMPLETE'; END IF;
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
  THEN RAISE EXCEPTION 'REFERRAL_EVIDENCE_MISMATCH'; END IF;
 END LOOP;
 -- Existing settlement verifies every receipt against the complete immutable plan.
 IF (public.settle_job_financial_resolution(j.id,'automatic_release')->>'settled')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'REFERRAL_RELEASE_INCOMPLETE'; END IF;
 INSERT INTO public.referral_credit_ledger(referral_id,beneficiary_id,award_kind,amount_cents,qualifying_request_id)
 VALUES(r.referred_id,r.referrer_id,'referrer',1500,j.id),
       (r.referred_id,r.referred_id,'referred',1500,j.id);
 UPDATE public.customer_referral_award_pending SET finished_at=clock_timestamp() WHERE request_id=j.id;
 RETURN jsonb_build_object('outcome','awarded');
END $$;
COMMIT;
