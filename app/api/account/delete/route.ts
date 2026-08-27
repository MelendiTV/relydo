import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY!;

const ACTIVE_REQUEST_STATUSES = ["open", "in_progress"];
const ACTIVE_CLAIM_STATUSES = ["open", "reviewing", "in_review"];

export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Account deletion: missing Supabase environment variables.");
      return NextResponse.json(
        { error: "Account deletion is not configured." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Validate the caller with the public key. The browser never receives the service-role key.
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await authClient.auth.getUser(accessToken);

    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const pending: string[] = [];

    // 1) Active jobs/requests block immediate deletion.
    const { count: activeJobs, error: activeJobsError } = await admin
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", ACTIVE_REQUEST_STATUSES);

    if (activeJobsError) throw activeJobsError;
    if ((activeJobs || 0) > 0) pending.push(`Active jobs: ${activeJobs}`);

    // 2) Open or under-review claims block immediate deletion.
    const { count: activeClaims, error: activeClaimsError } = await admin
      .from("job_claims")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", ACTIVE_CLAIM_STATUSES);

    if (activeClaimsError) throw activeClaimsError;
    if ((activeClaims || 0) > 0) pending.push(`Open claims: ${activeClaims}`);

    if (pending.length > 0) {
      return NextResponse.json(
        { error: "Account has unresolved items.", pending },
        { status: 409 }
      );
    }

    // Remove user-owned avatar objects first. Supabase Auth cannot delete a user
    // who still owns Storage objects. We only remove the customer's own folder.
    const { data: avatarFiles, error: avatarListError } = await admin.storage
      .from("customer-avatars")
      .list(user.id, { limit: 1000 });

    if (avatarListError) {
      console.warn("Account deletion: avatar list failed", avatarListError);
    } else if (avatarFiles?.length) {
      const paths = avatarFiles.map((file) => `${user.id}/${file.name}`);
      const { error: avatarRemoveError } = await admin.storage
        .from("customer-avatars")
        .remove(paths);

      if (avatarRemoveError) throw avatarRemoveError;
    }

    // IMPORTANT:
    // Historical transaction/job records may need to be retained for accounting,
    // fraud, disputes, tax, or other legal obligations. Their personal fields
    // should be anonymized according to RELYDO's final retention policy.
    // We remove the customer profile's direct personal data before deleting Auth.
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: "Deleted user",
        phone: null,
        avatar_url: null,
        city: null,
        state: null,
        zip: null,
      })
      .eq("id", user.id);

    if (profileError) {
      console.warn("Account deletion: profile anonymization failed", profileError);
      // Do not delete Auth if we cannot anonymize the profile safely.
      throw profileError;
    }

    // Permanently remove the authentication account. This must only run server-side.
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(
      user.id,
      false
    );

    if (deleteUserError) throw deleteUserError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { error: "We could not delete the account." },
      { status: 500 }
    );
  }
}
