import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/**
 * Creates a Supabase client for use in browser/client components.
 * Call this function in client components to interact with Supabase.
 */
export function createClient() {
  return createBrowserClient(
    clientEnv.SUPABASE_URL,
    clientEnv.SUPABASE_ANON_KEY
  );
}
