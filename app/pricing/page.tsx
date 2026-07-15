import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function PricingPage() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });

  function formatPrice(kop: number) {
    return `₽${(kop / 100).toLocaleString("ru-RU")}`;
  }

  return (
    <div className="mx-auto max-w-6xl p-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Тарифы</h1>
        <p className="mt-2 text-muted-foreground">Выберите подходящий план для вашего бизнеса</p>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">{plan.slug === "free" ? "Навсегда бесплатно" : "/ месяц"}</Badge>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="text-2xl font-bold">
                {plan.priceMonthly === 0 ? "Бесплатно" : formatPrice(plan.priceMonthly)}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2 text-sm">
                {Array.isArray(plan.features) &&
                  (plan.features as string[]).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant={plan.priceMonthly === 0 ? "default" : "outline"} className="w-full" asChild>
                <Link href="/create">{plan.priceMonthly === 0 ? "Начать бесплатно" : "Выбрать"}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
