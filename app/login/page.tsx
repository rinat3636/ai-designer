"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tab === "register" ? { email, password, name } : { email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка");
      toast.success(tab === "login" ? "Вы вошли" : "Аккаунт создан");
      router.push("/create");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle>{tab === "login" ? "Вход" : "Регистрация"}</CardTitle>
          <CardDescription>
            {tab === "login" ? "Войдите, чтобы сохранять свои проекты" : "Создайте аккаунт за минуту"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Button variant={tab === "login" ? "default" : "outline"} onClick={() => setTab("login")} type="button">
              Вход
            </Button>
            <Button variant={tab === "register" ? "default" : "outline"} onClick={() => setTab("register")} type="button">
              Регистрация
            </Button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {tab === "register" && (
              <Input placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="Пароль (минимум 8 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Подождите…" : tab === "login" ? "Войти" : "Создать аккаунт"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Можно продолжить без аккаунта — <Link href="/create" className="underline">создать дизайн</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
