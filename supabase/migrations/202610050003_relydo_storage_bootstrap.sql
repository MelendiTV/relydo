-- RELYDO canonical Storage configuration.
-- Formalizes the Storage configuration validated in TEST.
-- Excludes legacy TEST-only and duplicate policies.

-- RELYDO canonical Storage buckets.
-- Mirrors the validated TEST configuration.
-- Legacy bucket "avatars" is intentionally excluded.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'customer-avatars',
    'customer-avatars',
    true,
    5242880,
    ARRAY['image/jpeg','image/png','image/webp']::text[]
  ),
  (
    'provider-logos',
    'provider-logos',
    true,
    NULL,
    NULL
  ),
  (
    'provider-documents',
    'provider-documents',
    false,
    NULL,
    NULL
  ),
  (
    'request-photos',
    'request-photos',
    false,
    10485760,
    ARRAY['image/jpeg','image/png','image/webp']::text[]
  ),
  (
    'job-completion-evidence',
    'job-completion-evidence',
    false,
    52428800,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]::text[]
  ),
  (
    'claim-evidence',
    'claim-evidence',
    false,
    52428800,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]::text[]
  ),
  (
    'change-order-evidence',
    'change-order-evidence',
    false,
    52428800,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]::text[]
  )
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admin can read claim evidence" ON storage.objects;

CREATE POLICY "Admin can read claim evidence" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'claim-evidence'::"text") AND ("public"."has_admin_permission"('claims'::"text") OR "public"."has_admin_permission"('providers'::"text"))));

DROP POLICY IF EXISTS "Admin can view all provider files" ON storage.objects;

CREATE POLICY "Admin can view all provider files" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'provider-documents'::"text") AND "public"."has_admin_permission"('providers'::"text")));

DROP POLICY IF EXISTS "Anyone can upload request photos" ON storage.objects;

CREATE POLICY "Anyone can upload request photos" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'request-photos'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE ((("sr"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("sr"."customer_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "Anyone can view request photos" ON storage.objects;

CREATE POLICY "Anyone can view request photos" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'request-photos'::"text") AND "public"."can_view_request_photo"((("storage"."foldername"("name"))[1])::"uuid")));

DROP POLICY IF EXISTS "Customers delete own avatar" ON storage.objects;

CREATE POLICY "Customers delete own avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'customer-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Customers update own avatar" ON storage.objects;

CREATE POLICY "Customers update own avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'customer-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'customer-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Customers upload own avatar" ON storage.objects;

CREATE POLICY "Customers upload own avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'customer-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Provider logos public read" ON storage.objects;

CREATE POLICY "Provider logos public read" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'provider-logos'::"text"));

DROP POLICY IF EXISTS "Providers can update own documents" ON storage.objects;

CREATE POLICY "Providers can update own documents" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'provider-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'provider-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Providers can upload own documents" ON storage.objects;

CREATE POLICY "Providers can upload own documents" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'provider-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Providers can view own documents" ON storage.objects;

CREATE POLICY "Providers can view own documents" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'provider-documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Providers delete own logo" ON storage.objects;

CREATE POLICY "Providers delete own logo" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'provider-logos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Providers update own logo" ON storage.objects;

CREATE POLICY "Providers update own logo" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'provider-logos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'provider-logos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Providers upload own logo" ON storage.objects;

CREATE POLICY "Providers upload own logo" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'provider-logos'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

DROP POLICY IF EXISTS "Usuarios autenticados pueden subir evidencia" ON storage.objects;

CREATE POLICY "Usuarios autenticados pueden subir evidencia" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'claim-evidence'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."job_claims" "jc"
  WHERE ((("jc"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("jc"."customer_id" = "auth"."uid"()) OR ("jc"."provider_id" = "auth"."uid"())))))));

DROP POLICY IF EXISTS "Usuarios autenticados pueden ver evidencia" ON storage.objects;

CREATE POLICY "Usuarios autenticados pueden ver evidencia" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'claim-evidence'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."job_claims" "jc"
  WHERE ((("jc"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("jc"."customer_id" = "auth"."uid"()) OR ("jc"."provider_id" = "auth"."uid"())))))));

DROP POLICY IF EXISTS "admin view job completion evidence" ON storage.objects;

CREATE POLICY "admin view job completion evidence" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'job-completion-evidence'::"text") AND ("public"."has_admin_permission"('orders'::"text") OR ("public"."has_admin_permission"('claims'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."job_claims" "jc"
  WHERE (("jc"."request_id")::"text" = ("storage"."foldername"("objects"."name"))[1])))))));

DROP POLICY IF EXISTS "change_order_evidence_storage_insert" ON storage.objects;

CREATE POLICY "change_order_evidence_storage_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'change-order-evidence'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."change_orders" "co"
     JOIN "public"."service_requests" "sr" ON (("sr"."id" = "co"."request_id")))
  WHERE ((("co"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("co"."provider_id" = "auth"."uid"()) AND ("sr"."preferred_provider_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "change_order_evidence_storage_select" ON storage.objects;

CREATE POLICY "change_order_evidence_storage_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'change-order-evidence'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."change_orders" "co"
  WHERE ((("co"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND (("co"."provider_id" = "auth"."uid"()) OR ("co"."customer_id" = "auth"."uid"())))))));

DROP POLICY IF EXISTS "customer view own job completion evidence" ON storage.objects;

CREATE POLICY "customer view own job completion evidence" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'job-completion-evidence'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE ((("sr"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("sr"."customer_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "provider delete failed completion upload" ON storage.objects;

CREATE POLICY "provider delete failed completion upload" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'job-completion-evidence'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE ((("sr"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("sr"."preferred_provider_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "provider upload completion evidence" ON storage.objects;

CREATE POLICY "provider upload completion evidence" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'job-completion-evidence'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE ((("sr"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("sr"."preferred_provider_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "provider view completion evidence" ON storage.objects;

CREATE POLICY "provider view completion evidence" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'job-completion-evidence'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."service_requests" "sr"
  WHERE ((("sr"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("sr"."preferred_provider_id" = "auth"."uid"()))))));

DROP POLICY IF EXISTS "provider_delete_failed_change_order_evidence" ON storage.objects;

CREATE POLICY "provider_delete_failed_change_order_evidence" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'change-order-evidence'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."change_orders" "co"
     JOIN "public"."service_requests" "sr" ON (("sr"."id" = "co"."request_id")))
  WHERE ((("co"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("co"."provider_id" = "auth"."uid"()) AND ("sr"."preferred_provider_id" = "auth"."uid"()) AND ("co"."status" = 'pending'::"text") AND ("co"."payment_status" = 'unpaid'::"text") AND ("co"."stripe_checkout_session_id" IS NULL) AND ("co"."stripe_payment_intent_id" IS NULL))))));

DROP POLICY IF EXISTS "provider_delete_failed_claim_evidence" ON storage.objects;

CREATE POLICY "provider_delete_failed_claim_evidence" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'claim-evidence'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."job_claims" "jc"
  WHERE ((("jc"."id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("jc"."provider_id" = "auth"."uid"()) AND ("jc"."provider_responded_at" IS NULL))))));

DROP POLICY IF EXISTS "Customers delete own request photos"
ON storage.objects;

CREATE POLICY "Customers delete own request photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'request-photos'
  AND EXISTS (
    SELECT 1
    FROM public.service_requests r
    WHERE r.id::text = (storage.foldername(name))[1]
      AND r.customer_id = auth.uid()
  )
);
