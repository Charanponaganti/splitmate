import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value && k !== "page") search.set(k, value);
    }
    if (p > 1) search.set("page", String(p));
    return `${basePath}${search.size ? `?${search}` : ""}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t px-4 py-3 text-sm sm:px-5">
      <span className="text-muted-foreground">
        Page {page} of {pageCount} · {total} expenses
      </span>
      <div className="flex gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
        >
          <ChevronLeft /> Prev
        </Link>
        <Link
          href={href(page + 1)}
          aria-disabled={page >= pageCount}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pageCount && "pointer-events-none opacity-50")}
        >
          Next <ChevronRight />
        </Link>
      </div>
    </nav>
  );
}
