BEGIN;
-- Expose only the caller's code/balance and aggregate states. No invitee IDs or PII.
CREATE FUNCTION public.my_customer_referral_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE customer uuid := auth.uid(); result_code text;
BEGIN
 result_code := public.ensure_customer_referral_code(customer);
 RETURN jsonb_build_object(
  'code', result_code,
  'availableCents', public.referral_credit_balance(customer),
  'referred', EXISTS(SELECT 1 FROM public.customer_referrals WHERE referred_id=customer),
  'awarded', EXISTS(SELECT 1 FROM public.referral_credit_ledger WHERE referral_id=customer AND beneficiary_id=customer),
  'registered', (SELECT count(*) FROM public.customer_referrals WHERE referrer_id=customer),
  'pending', (SELECT count(*) FROM public.customer_referrals r WHERE r.referrer_id=customer
    AND NOT EXISTS(SELECT 1 FROM public.referral_credit_ledger l WHERE l.referral_id=r.referred_id AND l.beneficiary_id=customer)),
  'rewarded', (SELECT count(*) FROM public.referral_credit_ledger WHERE beneficiary_id=customer AND award_kind='referrer')
 );
END $$;
REVOKE ALL ON FUNCTION public.my_customer_referral_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_customer_referral_summary() TO authenticated;
-- Relationships contain another customer's ID/code; clients need only aggregates.
REVOKE SELECT ON public.customer_referrals FROM authenticated;
CREATE INDEX customer_referrals_referrer ON public.customer_referrals(referrer_id);
-- Small support lookup on the existing Users page; bounded and permission checked.
CREATE FUNCTION public.admin_customer_referrals(p_customer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'
   AND admin_role IN ('super_admin','support_agent')) THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_customer_id AND role='customer') THEN
   RAISE EXCEPTION 'CUSTOMER_REQUIRED';
 END IF;
 RETURN jsonb_build_object(
  'code', (SELECT code FROM public.customer_referral_codes WHERE customer_id=p_customer_id),
  'availableCents', public.referral_credit_balance(p_customer_id),
  'relationships', (SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb) FROM (
    SELECT referred_id, referrer_id, code, created_at,
      CASE WHEN EXISTS(SELECT 1 FROM public.referral_credit_ledger l WHERE l.referral_id=c.referred_id)
        THEN 'rewarded' ELSE 'pending' END AS status
    FROM public.customer_referrals c WHERE referred_id=p_customer_id OR referrer_id=p_customer_id
    ORDER BY created_at DESC LIMIT 100
  ) r)
 );
END $$;
REVOKE ALL ON FUNCTION public.admin_customer_referrals(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_customer_referrals(uuid) TO authenticated;
COMMIT;
