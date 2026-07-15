import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: "USER" | "ADMIN";
};

const COOKIE_NAME = "ai-session";
const ANONYMOUS_EMAIL = "anonymous@ai-designer.local";

function getSecret() {
  const raw = process.env.APP_SECRET || "dev-secret-change-in-production";
  return new TextEncoder().encode(raw);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return token;
}

export async function clearSession() {
  const c = await cookies();
  c.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

async function getAnonymousUser(): Promise<SessionUser> {
  let user = await prisma.user.findUnique({ where: { email: ANONYMOUS_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: ANONYMOUS_EMAIL,
        name: "Гость",
        password: await hashPassword("anonymous"),
        role: "ADMIN",
      },
    });
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function getSession(): Promise<SessionUser> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      return {
        id: String(payload.id),
        email: String(payload.email),
        name: payload.name ? String(payload.name) : null,
        role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      };
    } catch {
      // ignore invalid token
    }
  }
  return getAnonymousUser();
}
