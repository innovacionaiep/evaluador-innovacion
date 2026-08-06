import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiSecretStrict } from "@/lib/api-auth";

/**
 * Protect /api/* when EVALUADOR_API_SECRET is set.
 * Page routes and static assets are unaffected.
 * (Next.js 16+: file convention is `proxy`, formerly `middleware`.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Capabilities probe used before upload stays public so UI can decide paths;
  // actual upload/register still require secret when configured.
  if (pathname === "/api/upload/capabilities") {
    return NextResponse.next();
  }

  const auth = requireApiSecretStrict(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
