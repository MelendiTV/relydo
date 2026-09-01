import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function getAuthenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { user: null, accessToken: null, error: "missing_token" as const };
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    return { user: null, accessToken: null, error: "missing_token" as const };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return { user: null, accessToken, error: "invalid_token" as const };
  }

  return { user: data.user, accessToken, error: null };
}
