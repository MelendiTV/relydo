-- RELYDO runtime configuration
-- Formalizes payment settings and Realtime configuration validated in TEST.
-- Provider screening remains disabled by default.

-- Keep every currently active payment-settings row aligned with the
-- configuration validated end-to-end in TEST.
UPDATE public.payment_settings
SET
  provider_commission_percent = 10.00,
  customer_service_fee_percent = 5.00,
  currency = 'USD',
  customer_cancel_on_the_way_fee = 25.00,
  customer_cancel_arrived_fee = 50.00,
  cancellation_provider_percent = 80.00,
  customer_cancel_on_the_way_percent = 10.00,
  customer_cancel_arrived_percent = 20.00,
  payout_hold_minutes = 2160,
  updated_at = now()
WHERE active = true;

-- A fresh environment may not yet have an active row.
INSERT INTO public.payment_settings (
  provider_commission_percent,
  customer_service_fee_percent,
  currency,
  active,
  customer_cancel_on_the_way_fee,
  customer_cancel_arrived_fee,
  cancellation_provider_percent,
  customer_cancel_on_the_way_percent,
  customer_cancel_arrived_percent,
  payout_hold_minutes
)
SELECT
  10.00,
  5.00,
  'USD',
  true,
  25.00,
  50.00,
  80.00,
  10.00,
  20.00,
  2160
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_settings
  WHERE active = true
);

-- Add RELYDO live tables to Supabase Realtime only when missing.
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    FOREACH v_table IN ARRAY ARRAY[
      'job_messages',
      'notifications',
      'offers',
      'service_requests'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
          v_table
        );
      END IF;
    END LOOP;
  END IF;
END
$$;

-- Screening stays OFF until RELYDO deliberately enables Checkr.
INSERT INTO public.provider_screening_settings (
  singleton,
  enabled
)
VALUES (
  true,
  false
)
ON CONFLICT (singleton)
DO UPDATE SET
  enabled = false;
