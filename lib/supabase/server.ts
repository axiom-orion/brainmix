import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client. Reads + writes auth cookies via the Next.js
 * cookies() helper, so SSR pages see the current user.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const c of items) {
            cookieStore.set(c.name, c.value, c.options);
          }
        } catch {
          // Setting cookies from a Server Component throws - silently ignore.
          // Middleware or Route Handlers will set them.
        }
      },
    },
  });
}
