import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    const sessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role === "ADMIN" ? ("ADMIN" as const) : ("USER" as const),
    };
    await createSession(sessionUser);
    return NextResponse.json({ user: sessionUser });
  } catch (e) {
    console.error("Login error", e);
    return NextResponse.json({ error: "Не удалось войти" }, { status: 500 });
  }
}
