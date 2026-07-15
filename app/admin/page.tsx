"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AdminPage() {
  const [tab, setTab] = useState("stats");

  return (
    <div className="mx-auto max-w-7xl p-4 py-8">
      <h1 className="text-2xl font-semibold">Административная панель</h1>
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="mb-4 flex flex-wrap gap-2">
          <TabsTrigger value="stats">Статистика</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="plans">Тарифы</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          <TabsTrigger value="prompts">Промпты</TabsTrigger>
          <TabsTrigger value="logs">Логи</TabsTrigger>
          <TabsTrigger value="promocodes">Промокоды</TabsTrigger>
          <TabsTrigger value="generations">Генерации</TabsTrigger>
        </TabsList>
        <TabsContent value="stats"><StatsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="plans"><PlansTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="prompts"><PromptsTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
        <TabsContent value="promocodes"><PromocodesTab /></TabsContent>
        <TabsContent value="generations"><GenerationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(url)
      .then((r) => r.json())
      .then((json) => active && setData(json))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [url]);
  return { data, loading, refetch: () => setLoading(true) };
}

function StatsTab() {
  const { data, loading } = useFetch<any>("/api/admin/stats");
  if (loading || !data) return <div className="text-muted-foreground">Загрузка...</div>;
  const items = [
    { label: "Пользователи", value: data.users },
    { label: "Генерации", value: data.generations },
    { label: "Шаблоны", value: data.templates },
    { label: "Тарифы", value: data.plans },
    { label: "Логи", value: data.logs },
    { label: "Промокоды", value: data.promocodes },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [u, p] = await Promise.all([fetch("/api/admin/users").then((r) => r.json()), fetch("/api/admin/plans").then((r) => r.json())]);
    setUsers(u.users || []);
    setPlans(p.plans || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateUser(id: string, role: string, planId: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role, planId }),
    });
    if (res.ok) {
      toast.success("Пользователь обновлен");
      load();
    } else {
      toast.error("Ошибка обновления");
    }
  }

  if (loading) return <div className="text-muted-foreground">Загрузка...</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Имя</TableHead>
          <TableHead>Роль</TableHead>
          <TableHead>Тариф</TableHead>
          <TableHead>Генераций</TableHead>
          <TableHead>Дата регистрации</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell>{u.email}</TableCell>
            <TableCell>{u.name || "—"}</TableCell>
            <TableCell>
              <select
                className="rounded border bg-transparent px-2 py-1 text-sm"
                value={u.role}
                onChange={(e) => updateUser(u.id, e.target.value, u.subscription?.planId || "")}
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </TableCell>
            <TableCell>
              <select
                className="rounded border bg-transparent px-2 py-1 text-sm"
                value={u.subscription?.planId || ""}
                onChange={(e) => updateUser(u.id, u.role, e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </TableCell>
            <TableCell>{u._count?.generations || 0}</TableCell>
            <TableCell>
              {u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru") : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);

  async function load() {
    const p = await fetch("/api/admin/plans").then((r) => r.json());
    setPlans(p.plans || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function savePlan() {
    const body = {
      ...form,
      features: typeof form.features === "string" ? form.features.split(",").map((s: string) => s.trim()).filter(Boolean) : form.features,
    };
    const method = form.id ? "PUT" : "POST";
    const res = await fetch("/api/admin/plans", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(form.id ? "Тариф обновлен" : "Тариф создан");
      setForm(null);
      load();
    } else {
      toast.error("Ошибка");
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("Удалить тариф?")) return;
    await fetch(`/api/admin/plans?id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => setForm({ slug: "", name: "", description: "", priceMonthly: 0, monthlyLimit: 0, features: "", displayOrder: 0 })}>
        Добавить тариф
      </Button>
      {form && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input type="number" placeholder="Цена в копейках" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })} />
              <Input type="number" placeholder="Лимит генераций" value={form.monthlyLimit} onChange={(e) => setForm({ ...form, monthlyLimit: Number(e.target.value) })} />
              <Input type="number" placeholder="Порядок" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} />
            </div>
            <Textarea
              placeholder="Фичи через запятую"
              value={typeof form.features === "string" ? form.features : form.features.join(", ")}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
            />
            <div className="flex gap-2">
              <Button onClick={savePlan}>Сохранить</Button>
              <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Цена</TableHead>
            <TableHead>Лимит</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.slug}</TableCell>
              <TableCell>{p.priceMonthly}</TableCell>
              <TableCell>{p.monthlyLimit}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...p, features: p.features.join(", ") })}>Изм.</Button>{" "}
                <Button size="sm" variant="destructive" onClick={() => deletePlan(p.id)}>Удалить</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);

  async function load() {
    const t = await fetch("/api/admin/templates").then((r) => r.json());
    setTemplates(t.templates || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveTemplate() {
    const body = { ...form, fields: parseFields(form.fields), displayOrder: Number(form.displayOrder) };
    const method = form.id ? "PUT" : "POST";
    const res = await fetch("/api/admin/templates", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(form.id ? "Шаблон обновлен" : "Шаблон создан");
      setForm(null);
      load();
    } else {
      toast.error("Ошибка");
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Удалить шаблон?")) return;
    await fetch(`/api/admin/templates?id=${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => setForm({ slug: "", category: "", categoryKey: "", name: "", description: "", icon: "", displayOrder: 0, fields: "" })}>
        Добавить шаблон
      </Button>
      {form && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              <Input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Категория" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input placeholder="Ключ категории" value={form.categoryKey} onChange={(e) => setForm({ ...form, categoryKey: e.target.value })} />
              <Input placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Input placeholder="Icon (Lucide имя)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              <Input type="number" placeholder="Порядок" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} />
            </div>
            <Textarea
              placeholder='Поля JSON: [{"name":"headline","label":"Заголовок","type":"text","required":true}]'
              value={typeof form.fields === "string" ? form.fields : JSON.stringify(form.fields, null, 2)}
              onChange={(e) => setForm({ ...form, fields: e.target.value })}
              className="min-h-32 font-mono"
            />
            <div className="flex gap-2">
              <Button onClick={saveTemplate}>Сохранить</Button>
              <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.name}</TableCell>
              <TableCell>{t.category}</TableCell>
              <TableCell>{t.slug}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline" onClick={() => setForm({ ...t, fields: JSON.stringify(t.fields, null, 2) })}>Изм.</Button>{" "}
                <Button size="sm" variant="destructive" onClick={() => deleteTemplate(t.id)}>Удалить</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PromptsTab() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const p = await fetch("/api/admin/prompts").then((r) => r.json());
    setPrompts(p.prompts || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save(key: string, prompt: string, description: string) {
    const res = await fetch("/api/admin/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, prompt, description }),
    });
    if (res.ok) {
      toast.success("Промпт сохранен");
      load();
    } else {
      toast.error("Ошибка");
    }
  }

  if (loading) return <div className="text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-6">
      {prompts.map((p) => (
        <Card key={p.key}>
          <CardHeader>
            <CardTitle className="text-base">{p.key}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea defaultValue={p.prompt} rows={5} id={`prompt-${p.key}`} />
            <Textarea defaultValue={p.description} rows={2} id={`desc-${p.key}`} placeholder="Описание" />
            <Button onClick={() => save(p.key, (document.getElementById(`prompt-${p.key}`) as HTMLTextAreaElement).value, (document.getElementById(`desc-${p.key}`) as HTMLTextAreaElement).value)}>
              Сохранить
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LogsTab() {
  const { data, loading } = useFetch<any>("/api/admin/logs");
  if (loading || !data) return <div className="text-muted-foreground">Загрузка...</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Действие</TableHead>
          <TableHead>Пользователь</TableHead>
          <TableHead>Детали</TableHead>
          <TableHead>Время</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.logs.map((log: any) => (
          <TableRow key={log.id}>
            <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
            <TableCell>{log.user?.email}</TableCell>
            <TableCell className="max-w-md truncate">{log.details}</TableCell>
            <TableCell>{new Date(log.createdAt).toLocaleString("ru")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PromocodesTab() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: "", maxUses: "", bonusGenerations: 0, upgradePlanTo: "", expiresAt: "" });
  const [plans, setPlans] = useState<any[]>([]);

  async function load() {
    const [c, p] = await Promise.all([fetch("/api/admin/promocodes").then((r) => r.json()), fetch("/api/admin/plans").then((r) => r.json())]);
    setCodes(c.promocodes || []);
    setPlans(p.plans || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    const res = await fetch("/api/admin/promocodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        bonusGenerations: Number(form.bonusGenerations),
        upgradePlanTo: form.upgradePlanTo || null,
        expiresAt: form.expiresAt || null,
      }),
    });
    if (res.ok) {
      setForm({ code: "", maxUses: "", bonusGenerations: 0, upgradePlanTo: "", expiresAt: "" });
      toast.success("Промокод создан");
      load();
    } else {
      toast.error("Ошибка");
    }
  }

  async function deleteCode(code: string) {
    if (!confirm("Удалить промокод?")) return;
    await fetch(`/api/admin/promocodes?code=${code}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="text-muted-foreground">Загрузка...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Код" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input type="number" placeholder="Макс. использований" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            <Input type="number" placeholder="Бонус генераций" value={form.bonusGenerations} onChange={(e) => setForm({ ...form, bonusGenerations: Number(e.target.value) })} />
            <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            <select className="rounded border bg-transparent px-2 py-2" value={form.upgradePlanTo} onChange={(e) => setForm({ ...form, upgradePlanTo: e.target.value })}>
              <option value="">Без смены тарифа</option>
              {plans.map((p) => (
                <option key={p.id} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={create}>Создать промокод</Button>
        </CardContent>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Код</TableHead>
            <TableHead>Использований</TableHead>
            <TableHead>Лимит</TableHead>
            <TableHead>Бонус</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.map((c) => (
            <TableRow key={c.code}>
              <TableCell>{c.code}</TableCell>
              <TableCell>{c.usedCount}</TableCell>
              <TableCell>{c.maxUses || "∞"}</TableCell>
              <TableCell>{c.bonusGenerations}</TableCell>
              <TableCell><Button size="sm" variant="destructive" onClick={() => deleteCode(c.code)}>Удалить</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GenerationsTab() {
  const { data, loading } = useFetch<any>("/api/admin/generations");
  if (loading || !data) return <div className="text-muted-foreground">Загрузка...</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Пользователь</TableHead>
          <TableHead>Шаблон</TableHead>
          <TableHead>Название</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Картинок</TableHead>
          <TableHead>Время</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.generations.map((g: any) => (
          <TableRow key={g.id}>
            <TableCell>{g.user?.email}</TableCell>
            <TableCell>{g.template?.name}</TableCell>
            <TableCell>{g.title}</TableCell>
            <TableCell><Badge variant="outline">{g.status}</Badge></TableCell>
            <TableCell>{g.images?.length}</TableCell>
            <TableCell>{new Date(g.createdAt).toLocaleString("ru")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function parseFields(input: string): any[] {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
