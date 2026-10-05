-- Keep the legacy production customer signup function compatible
-- with the current RELYDO registration metadata.
-- Preserves the existing production trigger name and address_line2.

CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  metadata jsonb;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

  IF metadata ->> 'role' IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id,
    role,
    full_name,
    email,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    zip,
    preferred_language
  )
  VALUES (
    NEW.id,
    'customer',
    COALESCE(
      NULLIF(TRIM(metadata ->> 'full_name'), ''),
      NULLIF(split_part(COALESCE(lower(NEW.email), ''), '@', 1), ''),
      'Customer'
    ),
    lower(NEW.email),
    NULLIF(TRIM(metadata ->> 'phone'), ''),
    NULLIF(TRIM(metadata ->> 'address_line1'), ''),
    NULLIF(TRIM(metadata ->> 'address_line2'), ''),
    NULLIF(TRIM(metadata ->> 'city'), ''),
    UPPER(NULLIF(TRIM(metadata ->> 'state'), '')),
    NULLIF(TRIM(metadata ->> 'zip'), ''),
    CASE
      WHEN metadata ->> 'legal_language' IN ('es', 'en')
        THEN metadata ->> 'legal_language'
      ELSE 'en'
    END
  )
  ON CONFLICT (id)
  DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    address_line1 = EXCLUDED.address_line1,
    address_line2 = EXCLUDED.address_line2,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip = EXCLUDED.zip,
    preferred_language = EXCLUDED.preferred_language;

  RETURN NEW;
END;
$function$;
