import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";

/**
 * Public routes that don't require authentication.
 * Auth routes are also public but get special handling (redirect if already logged in).
 */
const publicRoutes = ["/", "/sign-in", "/sign-up", "/api/auth/callback"];
const authRoutes = ["/sign-in", "/sign-up"];

/**
 * Updates the Supabase auth session by refreshing expired tokens
 * and enforces route protection:
 * - Unauthenticated users are redirected to /sign-in from protected routes
 * - Authenticated users are redirected to /dashboard from auth pages
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    clientEnv.SUPABASE_URL,
    clientEnv.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token. This call is important - do not remove it.
  // It refreshes the auth token and ensures the session stays valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // If user is not authenticated and trying to access a protected route, redirect to sign-in
  if (!user && !publicRoutes.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // If user is authenticated and trying to access auth routes, redirect to dashboard
  if (user && authRoutes.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
