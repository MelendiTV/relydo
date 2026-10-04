import type { SupabaseClient } from "@supabase/supabase-js";

// Check only: a replaced browser must never silently reclaim the Pro session.
// Registration belongs to the explicit professional login flow.
export async function hasProviderDocumentSession(
  client: SupabaseClient,
  request: typeof fetch = fetch
) {
  const { data, error } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) return false;

  const response = await request("/api/auth/provider/activate-session", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 409) return false;
  if (!response.ok) throw new Error("Could not verify the professional session. Please try again.");
  const result = await response.json();
  return result.active === true;
}
