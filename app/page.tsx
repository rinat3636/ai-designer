import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateWizard } from "@/components/create-wizard";

export default async function HomePage() {
  const user = await getSession();

  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: [{ categoryKey: "asc" }, { displayOrder: "asc" }],
  });

  const brand = await prisma.brandSettings.findUnique({
    where: { userId: user.id },
  });

  return (
    <CreateWizard
      templates={JSON.parse(JSON.stringify(templates))}
      brand={brand ? JSON.parse(JSON.stringify(brand)) : null}
    />
  );
}
