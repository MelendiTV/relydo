-- RELYDO signup bootstrap
-- Formalizes the customer/provider Auth triggers validated in TEST.

CREATE OR REPLACE FUNCTION "public"."handle_relydo_new_customer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  metadata jsonb;
begin
  metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Este trigger solo atiende registros de Cliente.
  if metadata ->> 'role' is distinct from 'customer' then
    return new;
  end if;

  insert into public.profiles (
    id,
    role,
    full_name,
    phone,
    email,
    address_line1,
    city,
    state,
    zip,
    admin_role,
    preferred_language
  )
  values (
    new.id,
    'customer',

    coalesce(
      nullif(trim(metadata ->> 'full_name'), ''),
      nullif(split_part(coalesce(lower(new.email), ''), '@', 1), ''),
      'Customer'
    ),

    nullif(trim(metadata ->> 'phone'), ''),
    lower(new.email),
    nullif(trim(metadata ->> 'address_line1'), ''),
    nullif(trim(metadata ->> 'city'), ''),
    upper(nullif(trim(metadata ->> 'state'), '')),
    nullif(trim(metadata ->> 'zip'), ''),
    null,

    case
      when metadata ->> 'legal_language' in ('es', 'en')
        then metadata ->> 'legal_language'
      else 'en'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_relydo_new_customer"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_relydo_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  metadata jsonb;
  signup_type text;
  provider_trade text;
  provider_service_slug text;
  service_uuid uuid;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  signup_type := metadata ->> 'signup_type';

  IF signup_type IS DISTINCT FROM 'provider' THEN
    RETURN NEW;
  END IF;

  provider_trade := NULLIF(TRIM(metadata ->> 'trade'), '');

  INSERT INTO public.profiles (
    id, role, full_name, phone, email,
    address_line1, city, state, zip_code
  )
  VALUES (
    NEW.id,
    'provider',
    NULLIF(TRIM(metadata ->> 'legal_name'), ''),
    NULLIF(TRIM(metadata ->> 'phone'), ''),
    LOWER(NEW.email),
    NULLIF(TRIM(metadata ->> 'address'), ''),
    NULLIF(TRIM(metadata ->> 'city'), ''),
    UPPER(NULLIF(TRIM(metadata ->> 'state'), '')),
    NULLIF(TRIM(metadata ->> 'zip_code'), '')
  )
  ON CONFLICT (id)
  DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    address_line1 = EXCLUDED.address_line1,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip_code = EXCLUDED.zip_code;

  INSERT INTO public.provider_profiles (
    user_id,
    business_name,
    bio,
    trade,
    years_experience,
    service_radius_miles,
    city,
    state,
    zip_code,
    license_required,
    license_number,
    license_state,
    license_expiration,
    insured,
    insurance_company,
    insurance_expiration,
    bonded,
    verification_status,
    verified,
    active,
    average_rating,
    completed_jobs,
    registration_source
  )
  VALUES (
    NEW.id,
    NULLIF(TRIM(metadata ->> 'business_name'), ''),
    NULLIF(TRIM(metadata ->> 'bio'), ''),
    provider_trade,
    COALESCE(NULLIF(metadata ->> 'years_experience', '')::integer, 0),
    COALESCE(NULLIF(metadata ->> 'service_radius_miles', '')::integer, 25),
    NULLIF(TRIM(metadata ->> 'city'), ''),
    UPPER(NULLIF(TRIM(metadata ->> 'state'), '')),
    NULLIF(TRIM(metadata ->> 'zip_code'), ''),
    COALESCE((metadata ->> 'license_required')::boolean, false),
    NULLIF(TRIM(metadata ->> 'license_number'), ''),
    UPPER(NULLIF(TRIM(metadata ->> 'license_state'), '')),
    NULLIF(metadata ->> 'license_expiration', '')::date,
    COALESCE((metadata ->> 'insured')::boolean, false),
    NULLIF(TRIM(metadata ->> 'insurance_company'), ''),
    NULLIF(metadata ->> 'insurance_expiration', '')::date,
    COALESCE((metadata ->> 'bonded')::boolean, false),
    'pending',
    false,
    false,
    0,
    0,
    NULLIF(TRIM(metadata ->> 'registration_source'), '')
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    business_name = EXCLUDED.business_name,
    bio = EXCLUDED.bio,
    trade = EXCLUDED.trade,
    years_experience = EXCLUDED.years_experience,
    service_radius_miles = EXCLUDED.service_radius_miles,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    zip_code = EXCLUDED.zip_code,
    license_required = EXCLUDED.license_required,
    license_number = EXCLUDED.license_number,
    license_state = EXCLUDED.license_state,
    license_expiration = EXCLUDED.license_expiration,
    insured = EXCLUDED.insured,
    insurance_company = EXCLUDED.insurance_company,
    insurance_expiration = EXCLUDED.insurance_expiration,
    bonded = EXCLUDED.bonded;

  -- Convert the internal Pro trade to the canonical services.slug.
  provider_service_slug :=
    CASE provider_trade
      WHEN 'ac_rental' THEN 'ac-rental'
      WHEN 'appliance_repair' THEN 'appliance-repair'
      WHEN 'masonry' THEN 'concrete-masonry'
      WHEN 'doors_windows' THEN 'doors-windows'
      WHEN 'garage_doors' THEN 'garage-doors'
      WHEN 'pool_spa' THEN 'pools-spas'
      WHEN 'pest_control' THEN 'pest-control'
      WHEN 'pressure_washing' THEN 'pressure-washing'
      WHEN 'carpet_cleaning' THEN 'carpet-cleaning'
      WHEN 'junk_removal' THEN 'junk-removal'
      WHEN 'furniture_assembly' THEN 'furniture-assembly'
      WHEN 'smart_home' THEN 'tv-smart-home'
      ELSE provider_trade
    END;

  IF provider_service_slug IS NOT NULL THEN
    SELECT s.id
    INTO service_uuid
    FROM public.services s
    WHERE s.slug = provider_service_slug
      AND s.active = true
    LIMIT 1;

    IF service_uuid IS NOT NULL THEN
      INSERT INTO public.provider_services (
        provider_id,
        service_id
      )
      VALUES (
        NEW.id,
        service_uuid
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_relydo_new_user"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS relydo_create_customer_profile ON auth.users;

CREATE TRIGGER relydo_create_customer_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_relydo_new_customer();

DROP TRIGGER IF EXISTS relydo_create_provider_profile ON auth.users;

CREATE TRIGGER relydo_create_provider_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_relydo_new_user();
