BEGIN;
-- Awards remain in referral_credit_ledger; spending is an append-only companion ledger.
CREATE TABLE public.referral_credit_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL REFERENCES public.service_requests(id),
 offer_id uuid NOT NULL REFERENCES public.offers(id),
 snapshot jsonb NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 charge_cents bigint NOT NULL CHECK(charge_cents>=0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','consumed','released')),
 stripe_session_id text UNIQUE, stripe_payment_intent_id text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX referral_checkout_active_job ON public.referral_credit_checkouts(request_id) WHERE state IN ('reserved','consumed');
CREATE TABLE public.referral_credit_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 checkout_id uuid NOT NULL REFERENCES public.referral_credit_checkouts(id),
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN ('reserve','consume','return')),
 amount_cents bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(checkout_id,kind),
 CHECK((kind='reserve' AND amount_cents<=0) OR (kind='return' AND amount_cents>=0) OR (kind='consume' AND amount_cents=0))
);
CREATE TRIGGER referral_movements_immutable BEFORE UPDATE OR DELETE ON public.referral_credit_movements
 FOR EACH ROW EXECUTE FUNCTION public.referral_immutable();
ALTER TABLE public.referral_credit_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_credit_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_credit_checkouts,public.referral_credit_movements FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.referral_credit_checkouts,public.referral_credit_movements FROM service_role;
GRANT SELECT ON public.referral_credit_checkouts,public.referral_credit_movements TO service_role;
GRANT SELECT ON public.referral_credit_movements TO authenticated;
CREATE POLICY referral_movements_owner ON public.referral_credit_movements FOR SELECT TO authenticated USING(customer_id=auth.uid());
CREATE FUNCTION public.referral_credit_balance(p_customer_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT sum(amount_cents) FROM public.referral_credit_ledger WHERE beneficiary_id=p_customer_id),0)
 + coalesce((SELECT sum(amount_cents) FROM public.referral_credit_movements WHERE customer_id=p_customer_id),0);
$$;
CREATE FUNCTION public.my_referral_credit_balance() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.referral_credit_balance(auth.uid()); $$;
-- Only the trusted server supplies the snapshot, and SQL independently checks database pricing.
CREATE FUNCTION public.reserve_referral_checkout(p_customer_id uuid,p_request_id uuid,p_offer_id uuid,p_use_credit boolean,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.referral_credit_checkouts; j public.service_requests; o public.offers; s public.payment_settings;
 base numeric; fee numeric; commission numeric; total numeric; margin numeric; credit bigint; balance bigint;
BEGIN
 SELECT * INTO STRICT j FROM public.service_requests WHERE id=p_request_id FOR UPDATE;
 PERFORM 1 FROM public.profiles WHERE id=p_customer_id AND role='customer' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_REQUIRED'; END IF;
 IF j.customer_id<>p_customer_id OR j.status<>'open' THEN RAISE EXCEPTION 'CHECKOUT_UNAVAILABLE'; END IF;
 SELECT * INTO r FROM public.referral_credit_checkouts WHERE request_id=p_request_id AND state IN ('reserved','consumed');
 IF FOUND THEN
  IF r.snapshot->>'payment_flow' IS DISTINCT FROM p_snapshot->>'payment_flow' OR r.offer_id<>p_offer_id OR (r.snapshot->>'use_referral_credit')::boolean IS DISTINCT FROM p_use_credit THEN
   RAISE EXCEPTION 'CANCEL_PREVIOUS_CHECKOUT_FIRST';
  END IF;
  RETURN to_jsonb(r);
 END IF;
 SELECT * INTO STRICT o FROM public.offers WHERE id=p_offer_id AND request_id=p_request_id;
 IF o.status<>'pending' OR o.professional_id=p_customer_id THEN RAISE EXCEPTION 'OFFER_UNAVAILABLE'; END IF;
 SELECT * INTO STRICT s FROM public.payment_settings WHERE active ORDER BY created_at DESC LIMIT 1;
 base:=round(o.price::numeric,2); fee:=round(base*s.customer_service_fee_percent/100,2);
 commission:=round(base*s.provider_commission_percent/100,2); total:=base+fee; margin:=fee+commission;
 IF p_snapshot->>'payment_type' IS DISTINCT FROM 'initial_job' OR coalesce(p_snapshot->>'payment_flow','') NOT IN ('web','payment_sheet') OR base<=0 OR s.customer_service_fee_percent<0 OR s.provider_commission_percent NOT BETWEEN 0 AND 100
 OR upper(s.currency)<>'USD' OR p_snapshot->>'currency'<>'USD'
 OR p_snapshot->>'customer_id' IS DISTINCT FROM p_customer_id::text
 OR p_snapshot->>'request_id' IS DISTINCT FROM p_request_id::text
 OR p_snapshot->>'offer_id' IS DISTINCT FROM p_offer_id::text
 OR p_snapshot->>'professional_id' IS DISTINCT FROM o.professional_id::text
 OR p_snapshot->>'payment_settings_id' IS DISTINCT FROM s.id::text
 OR (p_snapshot->>'professional_price')::numeric IS DISTINCT FROM base
 OR (p_snapshot->>'customer_fee_percent')::numeric IS DISTINCT FROM s.customer_service_fee_percent
 OR (p_snapshot->>'customer_fee_amount')::numeric IS DISTINCT FROM fee
 OR (p_snapshot->>'customer_total')::numeric IS DISTINCT FROM total
 OR (p_snapshot->>'provider_commission_percent')::numeric IS DISTINCT FROM s.provider_commission_percent
 OR (p_snapshot->>'provider_commission_amount')::numeric IS DISTINCT FROM commission
 OR (p_snapshot->>'provider_net_amount')::numeric IS DISTINCT FROM base-commission
 OR (p_snapshot->>'platform_revenue_amount')::numeric IS DISTINCT FROM margin THEN RAISE EXCEPTION 'INVALID_CHECKOUT_SNAPSHOT'; END IF;
 balance:=public.referral_credit_balance(p_customer_id);
 IF balance<0 THEN RAISE EXCEPTION 'INVALID_CREDIT_BALANCE'; END IF;
 credit:=CASE WHEN p_use_credit THEN least(balance,(margin*100)::bigint) ELSE 0 END;
 INSERT INTO public.referral_credit_checkouts(customer_id,request_id,offer_id,snapshot,amount_cents,charge_cents)
 VALUES(p_customer_id,p_request_id,p_offer_id,p_snapshot||jsonb_build_object('use_referral_credit',p_use_credit::text),credit,(total*100)::bigint-credit) RETURNING * INTO r;
 UPDATE public.referral_credit_checkouts SET snapshot=snapshot||jsonb_build_object(
 'referral_credit_reservation_id',r.id::text,'referral_credit_applied',(credit::numeric/100)::text,
 'customer_charge_amount',(r.charge_cents::numeric/100)::text) WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.referral_credit_movements(checkout_id,customer_id,kind,amount_cents) VALUES(r.id,p_customer_id,'reserve',-credit);
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.attach_referral_checkout(p_id uuid,p_session_id text,p_intent_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.referral_credit_checkouts;
BEGIN
 SELECT * INTO STRICT r FROM public.referral_credit_checkouts WHERE id=p_id FOR UPDATE;
 IF r.state<>'reserved' OR (p_session_id IS NULL AND p_intent_id IS NULL)
 OR (r.stripe_session_id IS NOT NULL AND r.stripe_session_id IS DISTINCT FROM p_session_id)
 OR (r.stripe_payment_intent_id IS NOT NULL AND r.stripe_payment_intent_id IS DISTINCT FROM p_intent_id) THEN RAISE EXCEPTION 'CHECKOUT_REFERENCE_CONFLICT'; END IF;
 UPDATE public.referral_credit_checkouts SET stripe_session_id=coalesce(stripe_session_id,p_session_id),stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_intent_id) WHERE id=p_id;
END $$;
-- Server calls only after retrieving terminal Stripe state, never on a browser claim or a clock timeout.
CREATE FUNCTION public.return_referral_checkout(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.referral_credit_checkouts;
BEGIN
 SELECT customer_id INTO r.customer_id FROM public.referral_credit_checkouts WHERE id=p_id;
 PERFORM 1 FROM public.profiles WHERE id=r.customer_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.referral_credit_checkouts WHERE id=p_id FOR UPDATE;
 IF r.state='released' THEN RETURN; END IF;
 IF r.state='consumed' THEN RAISE EXCEPTION 'CREDIT_ALREADY_CONSUMED'; END IF;
 INSERT INTO public.referral_credit_movements(checkout_id,customer_id,kind,amount_cents) VALUES(r.id,r.customer_id,'return',r.amount_cents);
 UPDATE public.referral_credit_checkouts SET state='released' WHERE id=r.id;
END $$;
ALTER TABLE public.payments ADD COLUMN referral_credit_reservation_id uuid UNIQUE REFERENCES public.referral_credit_checkouts(id),
 ADD COLUMN referral_credit_applied numeric(12,2) NOT NULL DEFAULT 0 CHECK(referral_credit_applied>=0),
 ADD COLUMN customer_charge_amount numeric(12,2);
ALTER TABLE public.payments ADD CONSTRAINT referral_payment_charge CHECK (
 (referral_credit_reservation_id IS NULL AND referral_credit_applied=0 AND (customer_charge_amount IS NULL OR customer_charge_amount=customer_total_amount))
 OR (referral_credit_reservation_id IS NOT NULL AND customer_charge_amount=customer_total_amount-referral_credit_applied
 AND customer_charge_amount>=provider_net_amount AND referral_credit_applied<=customer_fee_amount+provider_commission_amount));
CREATE FUNCTION public.consume_referral_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.referral_credit_checkouts;
BEGIN
 IF TG_OP='UPDATE' AND OLD.referral_credit_reservation_id IS NOT NULL AND
 (OLD.referral_credit_reservation_id IS DISTINCT FROM NEW.referral_credit_reservation_id OR OLD.referral_credit_applied IS DISTINCT FROM NEW.referral_credit_applied OR OLD.customer_charge_amount IS DISTINCT FROM NEW.customer_charge_amount) THEN RAISE EXCEPTION 'IMMUTABLE_CREDIT_SNAPSHOT'; END IF;
 IF NEW.referral_credit_reservation_id IS NULL THEN RETURN NEW; END IF;
 SELECT customer_id INTO r.customer_id FROM public.referral_credit_checkouts WHERE id=NEW.referral_credit_reservation_id;
 PERFORM 1 FROM public.profiles WHERE id=r.customer_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.referral_credit_checkouts WHERE id=NEW.referral_credit_reservation_id FOR UPDATE;
 IF (r.charge_cents>0 AND r.stripe_payment_intent_id IS NULL) OR r.state='released' OR NEW.customer_id IS DISTINCT FROM r.customer_id OR NEW.request_id IS DISTINCT FROM r.request_id OR NEW.offer_id IS DISTINCT FROM r.offer_id
 OR NEW.provider_id::text IS DISTINCT FROM r.snapshot->>'professional_id'
 OR NEW.provider_payment_id IS DISTINCT FROM r.stripe_payment_intent_id
 OR NEW.customer_total_amount IS DISTINCT FROM (r.snapshot->>'customer_total')::numeric
 OR NEW.job_amount IS DISTINCT FROM (r.snapshot->>'professional_price')::numeric
 OR NEW.customer_fee_percent IS DISTINCT FROM (r.snapshot->>'customer_fee_percent')::numeric
 OR NEW.customer_fee_amount IS DISTINCT FROM (r.snapshot->>'customer_fee_amount')::numeric
 OR NEW.provider_commission_percent IS DISTINCT FROM (r.snapshot->>'provider_commission_percent')::numeric
 OR NEW.provider_commission_amount IS DISTINCT FROM (r.snapshot->>'provider_commission_amount')::numeric
 OR NEW.provider_net_amount IS DISTINCT FROM (r.snapshot->>'provider_net_amount')::numeric
 OR NEW.platform_revenue_amount IS DISTINCT FROM (r.snapshot->>'platform_revenue_amount')::numeric
 OR NEW.currency IS DISTINCT FROM 'USD' OR NEW.referral_credit_applied*100 IS DISTINCT FROM r.amount_cents::numeric
 OR NEW.customer_charge_amount*100 IS DISTINCT FROM r.charge_cents::numeric THEN RAISE EXCEPTION 'INVALID_CREDIT_PAYMENT'; END IF;
 IF r.state='reserved' THEN
  INSERT INTO public.referral_credit_movements(checkout_id,customer_id,kind,amount_cents) VALUES(r.id,r.customer_id,'consume',0);
  UPDATE public.referral_credit_checkouts SET state='consumed' WHERE id=r.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER consume_referral_payment BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.consume_referral_payment();
REVOKE ALL ON FUNCTION public.referral_credit_balance(uuid),public.my_referral_credit_balance(),public.reserve_referral_checkout(uuid,uuid,uuid,boolean,jsonb),public.attach_referral_checkout(uuid,text,text),public.return_referral_checkout(uuid),public.consume_referral_payment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_credit_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.referral_credit_balance(uuid),public.reserve_referral_checkout(uuid,uuid,uuid,boolean,jsonb),public.attach_referral_checkout(uuid,text,text),public.return_referral_checkout(uuid) TO service_role;
-- Full credit with a zero Pro net needs no Stripe charge and no minimum-payment rule.
CREATE FUNCTION public.confirm_zero_referral_checkout(p_id uuid,p_customer_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.referral_credit_checkouts; j public.service_requests; o public.offers; m jsonb;
BEGIN
 SELECT * INTO STRICT r FROM public.referral_credit_checkouts WHERE id=p_id;
 SELECT * INTO STRICT j FROM public.service_requests WHERE id=r.request_id FOR UPDATE;
 PERFORM 1 FROM public.profiles WHERE id=r.customer_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.referral_credit_checkouts WHERE id=p_id FOR UPDATE;
 IF r.customer_id<>p_customer_id OR r.charge_cents<>0 OR r.amount_cents<=0 OR (r.snapshot->>'provider_net_amount')::numeric<>0
 OR r.stripe_session_id IS NOT NULL OR r.stripe_payment_intent_id IS NOT NULL OR r.state='released' THEN RAISE EXCEPTION 'INVALID_ZERO_CHECKOUT'; END IF;
 IF r.state='consumed' THEN RETURN; END IF;
 SELECT * INTO STRICT o FROM public.offers WHERE id=r.offer_id FOR UPDATE;
 IF j.status<>'open' OR o.status<>'pending' OR EXISTS(SELECT 1 FROM public.payments WHERE request_id=r.request_id AND status NOT IN ('failed','cancelled')) THEN RAISE EXCEPTION 'CHECKOUT_UNAVAILABLE'; END IF;
 m:=r.snapshot;
 INSERT INTO public.payments(request_id,offer_id,customer_id,provider_id,job_amount,customer_fee_percent,customer_fee_amount,customer_total_amount,
 provider_commission_percent,provider_commission_amount,provider_net_amount,platform_revenue_amount,currency,status,payment_provider,provider_payment_id,refunded_amount,paid_at,updated_at,
 referral_credit_reservation_id,referral_credit_applied,customer_charge_amount)
 VALUES(r.request_id,r.offer_id,r.customer_id,o.professional_id,(m->>'professional_price')::numeric,(m->>'customer_fee_percent')::numeric,(m->>'customer_fee_amount')::numeric,(m->>'customer_total')::numeric,
 (m->>'provider_commission_percent')::numeric,(m->>'provider_commission_amount')::numeric,0,(m->>'platform_revenue_amount')::numeric,'USD','ready_for_payout','stripe',NULL,0,now(),now(),r.id,r.amount_cents::numeric/100,0);
 UPDATE public.service_requests SET status='in_progress',preferred_provider_id=o.professional_id WHERE id=r.request_id;
 UPDATE public.offers SET status=CASE WHEN id=r.offer_id THEN 'selected' ELSE 'rejected' END WHERE request_id=r.request_id AND status='pending';
END $$;
REVOKE ALL ON FUNCTION public.confirm_zero_referral_checkout(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_zero_referral_checkout(uuid,uuid) TO service_role;
-- Reassignment retains physical customer funds, not the gross promotional snapshot.
CREATE FUNCTION public.referral_reassignment_cash_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.payments;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=NEW.original_payment_id;
 IF p.referral_credit_reservation_id IS NOT NULL THEN
  NEW.available_credit:=least(NEW.available_credit,greatest(0,p.customer_charge_amount-coalesce(p.refunded_amount,0)));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER referral_reassignment_cash_guard BEFORE INSERT OR UPDATE OF available_credit ON public.payment_reassignments
 FOR EACH ROW EXECUTE FUNCTION public.referral_reassignment_cash_guard();
REVOKE ALL ON FUNCTION public.referral_reassignment_cash_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX referral_ledger_balance_customer ON public.referral_credit_ledger(beneficiary_id);
CREATE INDEX referral_movements_balance_customer ON public.referral_credit_movements(customer_id);
CREATE INDEX referral_checkouts_pending_customer ON public.referral_credit_checkouts(customer_id) WHERE state='reserved';
COMMIT;
