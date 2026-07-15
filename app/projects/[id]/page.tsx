import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ResultGallery } from "@/components/result-gallery";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return notFound();

  const { id } = await params;
  const generation = await prisma.generation.findFirst({
    where: { id, userId: user.id },
    include: { images: true, template: true },
  });

  if (!generation) return notFound();

  return (
    <div className="mx-auto max-w-6xl p-4 py-8">
      <ResultGallery generation={JSON.parse(JSON.stringify(generation))} />
    </div>
  );
}
