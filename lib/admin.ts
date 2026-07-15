import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function requireAdmin() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}

export function adminForbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
