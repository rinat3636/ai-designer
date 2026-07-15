import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Sparkles className="size-5 text-primary" />
          <span>AI Designer</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/create" className="text-muted-foreground hover:text-foreground">Создать</Link>
          <Link href="/projects" className="text-muted-foreground hover:text-foreground">Проекты</Link>
          <Link href="/brand" className="text-muted-foreground hover:text-foreground">Бренд</Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Тарифы</Link>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">Админ</Link>
        </nav>

        <div className="flex items-center gap-3 md:hidden">
          <Button asChild size="sm">
            <Link href="/create">Создать</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
