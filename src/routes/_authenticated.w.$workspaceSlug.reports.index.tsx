import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, GitCompareArrows } from "lucide-react";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/reports/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reportes · Riel" }] }),
  errorComponent: RouteError,
  component: ReportsIndex,
});

const CATALOG = [
  {
    to: "/w/$workspaceSlug/reports/tiempo",
    icon: Clock,
    title: "Tiempo por dimensión",
    desc: "Horas registradas y facturables agrupadas por proyecto, miembro o cliente.",
  },
  {
    to: "/w/$workspaceSlug/reports/plan-vs-real",
    icon: GitCompareArrows,
    title: "Plan vs. real",
    desc: "Estimado prorrateado por días hábiles contra horas registradas, con desviación.",
  },
] as const;

function ReportsIndex() {
  const { workspaceSlug } = Route.useParams();
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <p className="text-xs text-muted-foreground">
        Catálogo de reportes del espacio. Todos permiten filtrar por periodo y exportar CSV.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CATALOG.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            params={{ workspaceSlug }}
            className="border border-border rounded-md p-4 hover:bg-muted/30 transition-colors block"
          >
            <div className="flex items-center gap-2 mb-1">
              <r.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{r.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
