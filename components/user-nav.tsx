"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";

export function UserNav({ user }: { user: SessionUser }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {user.name || user.email}
      </span>
      <Button variant="outline" size="sm" onClick={logout}>
        Выйти
      </Button>
    </div>
  );
}
