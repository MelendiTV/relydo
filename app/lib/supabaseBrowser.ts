import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

type BrowserWindowWithSupabase = Window & {
  __relydoSupabaseBrowser?: SupabaseClient;
};

const browserWindow =
  typeof window !== "undefined"
    ? (window as BrowserWindowWithSupabase)
    : null;

export const supabase =
  browserWindow?.__relydoSupabaseBrowser ??
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

if (
  browserWindow &&
  !browserWindow.__relydoSupabaseBrowser
) {
  browserWindow.__relydoSupabaseBrowser = supabase;
}
