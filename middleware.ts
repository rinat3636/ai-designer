import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "ai-session";

function getSecret() {
  const raw = process.env.APP_SECRET || "dev-secret-change-in-production";
  return new TextEncoder().encode(raw);
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  let user: { id: string; email: string; role: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      user = {
        id: String(payload.id),
        email: String(payload.email),
        role: String(payload.role),
      };
    } catch {
      user = null;
    }
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && (!user || user.role !== "ADMIN")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const protectedPaths = ["/create", "/projects", "/brand"];
  if (protectedPaths.some((p) => pathname.startsWith(p)) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" || pathname === "/register") {
    if (user) {
      return NextResponse.redirect(new URL("/projects", request.url));
    }
  }

  const requestHeaders = new Headers(request.headers);
  if (user) {
    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-role", user.role);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|generated|.*\\..*$).*)",
  ],
};
