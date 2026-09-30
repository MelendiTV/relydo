-- Isolated PostgreSQL fixture extracted from the audited schema, not a production migration.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avatar_url" "text",
    "address_line1" "text",
    "address_line2" "text",
    "zip" "text",
    "address" "text",
    "admin_role" "text",
    "preferred_language" "text" DEFAULT 'en'::"text",
    "stripe_customer_id" "text",
    CONSTRAINT "profiles_admin_role_check" CHECK ((("admin_role" IS NULL) OR ("admin_role" = ANY (ARRAY['super_admin'::"text", 'claims_manager'::"text", 'finance_manager'::"text", 'provider_manager'::"text", 'support_agent'::"text", 'operations_manager'::"text"])))),
    CONSTRAINT "profiles_admin_role_consistency_check" CHECK (((("role" = 'admin'::"text") AND ("admin_role" IS NOT NULL)) OR (("role" <> 'admin'::"text") AND ("admin_role" IS NULL)))),
    CONSTRAINT "profiles_preferred_language_check" CHECK (("preferred_language" = ANY (ARRAY['es'::"text", 'en'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['customer'::"text", 'provider'::"text", 'admin'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."provider_profiles" (
    "user_id" "uuid" NOT NULL,
    "business_name" "text",
    "bio" "text",
    "years_experience" integer,
    "service_radius_miles" integer DEFAULT 25 NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "average_rating" numeric(3,2) DEFAULT 0,
    "completed_jobs" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trade" "text",
    "license_required" boolean DEFAULT false,
    "license_number" "text",
    "license_state" "text",
    "license_expiration" "date",
    "insured" boolean DEFAULT false,
    "insurance_company" "text",
    "insurance_expiration" "date",
    "bonded" boolean DEFAULT false,
    "verification_status" "text" DEFAULT 'pending'::"text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    "company_logo_url" "text",
    "stripe_account_id" "text",
    "stripe_onboarding_complete" boolean DEFAULT false NOT NULL,
    "stripe_charges_enabled" boolean DEFAULT false NOT NULL,
    "stripe_payouts_enabled" boolean DEFAULT false NOT NULL,
    "address" "text",
    "avatar_url" "text",
    "latitude" numeric,
    "longitude" numeric,
    "registration_source" "text",
    "cover_url" "text",
    CONSTRAINT "provider_profiles_registration_source_check" CHECK ((("registration_source" IS NULL) OR ("registration_source" = ANY (ARRAY['web'::"text", 'pro_mobile'::"text"])))),
    CONSTRAINT "provider_profiles_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'under_review'::"text", 'verified'::"text", 'rejected'::"text", 'suspended'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."provider_services" (
    "provider_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "service_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "address_line1" "text" NOT NULL,
    "address_line2" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip_code" "text" NOT NULL,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "preferred_date" "date",
    "preferred_time" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "customer_email" "text",
    "preferred_provider_id" "uuid",
    "job_stage" "text",
    "cancellation_reason" "text",
    "cancelled_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "completion_review_status" "text",
    "submitted_for_review_at" timestamp with time zone,
    "completion_approved_at" timestamp with time zone,
    "job_stage_updated_at" timestamp with time zone,
    CONSTRAINT "service_requests_completion_review_status_check" CHECK ((("completion_review_status" IS NULL) OR ("completion_review_status" = ANY (ARRAY['pending'::"text", 'approved'::"text"])))),
    CONSTRAINT "service_requests_job_stage_check" CHECK ((("job_stage" IS NULL) OR ("job_stage" = ANY (ARRAY['hired'::"text", 'on_the_way'::"text", 'arrived'::"text", 'working'::"text", 'completed'::"text"])))),
    CONSTRAINT "service_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'quoted'::"text", 'assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewee_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);
CREATE OR REPLACE FUNCTION "public"."has_admin_permission"("p_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and (
        p.admin_role = 'super_admin'

        or (
          p.admin_role = 'claims_manager'
          and p_permission in (
            'admin_home',
            'claims'
          )
        )

        or (
          p.admin_role = 'finance_manager'
          and p_permission in (
            'admin_home',
            'finance',
            'financial_settings'
          )
        )

        or (
          p.admin_role = 'provider_manager'
          and p_permission in (
            'admin_home',
            'providers'
          )
        )

        or (
          p.admin_role = 'support_agent'
          and p_permission in (
            'admin_home',
            'users',
            'orders'
          )
        )

        or (
          p.admin_role = 'operations_manager'
          and p_permission in (
            'admin_home',
            'orders',
            'providers',
            'alerts',
            'activity'
          )
        )
      )
  );
$$;
CREATE OR REPLACE FUNCTION "public"."relydo_provider_payments_ready"("p_provider_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.provider_profiles pp
    where pp.user_id = p_provider_id
      and pp.verification_status = 'verified'
      and pp.verified = true
      and pp.active = true
      and pp.stripe_account_id is not null
      and pp.stripe_onboarding_complete = true
      and pp.stripe_payouts_enabled = true
  );
$$;
CREATE POLICY "Admin can update all provider profiles" ON "public"."provider_profiles" FOR UPDATE TO "authenticated" USING ("public"."has_admin_permission"('providers'::"text")) WITH CHECK ("public"."has_admin_permission"('providers'::"text"));
CREATE POLICY "Admin can view all provider profiles" ON "public"."provider_profiles" FOR SELECT TO "authenticated" USING (("public"."has_admin_permission"('providers'::"text") OR "public"."has_admin_permission"('claims'::"text") OR "public"."has_admin_permission"('orders'::"text")));
CREATE POLICY "Authenticated users can create own service requests" ON "public"."service_requests" FOR INSERT TO "authenticated" WITH CHECK ((("customer_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['customer'::"text", 'provider'::"text"]))))) AND ("status" = 'open'::"text") AND ("job_stage" IS NULL) AND ("cancellation_reason" IS NULL) AND ("cancelled_at" IS NULL) AND ("completed_at" IS NULL) AND ("completion_review_status" IS NULL) AND ("submitted_for_review_at" IS NULL) AND ("completion_approved_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."services" "s"
  WHERE (("s"."id" = "service_requests"."service_id") AND ("s"."active" = true)))) AND (("preferred_provider_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."provider_profiles" "pp"
  WHERE (("pp"."user_id" = "service_requests"."preferred_provider_id") AND ("pp"."verification_status" = 'verified'::"text") AND ("pp"."verified" = true) AND ("pp"."active" = true)))))));
CREATE POLICY "Providers can insert own profile" ON "public"."provider_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
CREATE POLICY "Providers can update own profile" ON "public"."provider_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
CREATE POLICY "Providers can view own profile" ON "public"."provider_profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
CREATE POLICY "Public can view provider reviews" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."provider_profiles" "pp"
  WHERE (("pp"."user_id" = "reviews"."reviewee_id") AND ("pp"."verification_status" = 'verified'::"text") AND ("pp"."verified" = true) AND ("pp"."active" = true)))));
CREATE POLICY "Public can view verified providers" ON "public"."provider_profiles" FOR SELECT TO "authenticated", "anon" USING ((("verification_status" = 'verified'::"text") AND ("verified" = true) AND ("active" = true)));
CREATE POLICY "Users can view provider services" ON "public"."provider_services" FOR SELECT TO "authenticated", "anon" USING (true);
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT(address) ON provider_profiles TO anon;
