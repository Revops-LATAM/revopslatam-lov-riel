import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";

export type Crumb = {
  label: ReactNode;
  to?: string;
  params?: Record<string, string>;
};

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-muted-foreground min-w-0"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-50" aria-hidden />}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                params={item.params}
                className="hover:text-foreground transition-colors truncate max-w-[180px]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={`truncate max-w-[240px] ${isLast ? "text-foreground font-medium" : ""}`}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
