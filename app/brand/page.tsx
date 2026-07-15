"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function BrandPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    businessDesc: "",
    website: "",
    phone: "",
    telegram: "",
    email: "",
    address: "",
    logoUrl: "",
    colors: "",
    fonts: "",
    targetAudience: "",
    style: "",
  });

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((json) => {
        if (json.brand) {
          const b = json.brand;
          setForm({
            companyName: b.companyName || "",
            businessDesc: b.businessDesc || "",
            website: b.website || "",
            phone: b.phone || "",
            telegram: b.telegram || "",
            email: b.email || "",
            address: b.address || "",
            logoUrl: b.logoUrl || "",
            colors: Array.isArray(b.colors) ? b.colors.join(", ") : "",
            fonts: Array.isArray(b.fonts) ? b.fonts.join(", ") : "",
            targetAudience: b.targetAudience || "",
            style: b.style || "",
          });
        }
        setLoading(false);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...form,
      colors: form.colors.split(/[,;]/).map((c) => c.trim()).filter(Boolean),
      fonts: form.fonts.split(/[,;]/).map((f) => f.trim()).filter(Boolean),
    };
    const res = await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Настройки бренда сохранены");
    } else {
      toast.error("Не удалось сохранить");
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Настройки бренда</CardTitle>
          <CardDescription>Укажите данные компании один раз — они автоматически подставятся в макеты</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Название компании</Label>
                <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Логотип (URL)</Label>
                <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Описание бизнеса</Label>
              <Textarea value={form.businessDesc} onChange={(e) => setForm({ ...form, businessDesc: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Сайт</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telegram</Label>
                <Input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Адрес</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Стиль</Label>
                <Input value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder="Минимализм" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Фирменные цвета</Label>
                <Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="#2563eb, #f8fafc" />
              </div>
              <div className="space-y-2">
                <Label>Фирменные шрифты</Label>
                <Input value={form.fonts} onChange={(e) => setForm({ ...form, fonts: e.target.value })} placeholder="Inter, Roboto" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Целевая аудитория</Label>
              <Input value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Сохранение..." : "Сохранить настройки"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
