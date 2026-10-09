import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/reports")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reportes · Riel" }] }),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    const ws = await requirePermission(context.queryClient, params.workspaceSlug, "reports_view");
    // Reportes: sólo super_admin y el gerente de operaciones.
    const { canViewReports } = await import("@/lib/api/me.functions");
    const { allowed } = await canViewReports();
    if (!allowed) {
      const { redirect } = await import("@tanstack/react-router");
      throw redirect({
        to: "/w/$workspaceSlug",
        params: { workspaceSlug: ws.slug },
        replace: true,
      });
    }
    return null;
  },
  errorComponent: RouteError,
  component: ReportsLayout,
});

const TABS = [
  { to: "/w/$workspaceSlug/reports", label: "Todos", exact: true },
  { to: "/w/$workspaceSlug/reports/tiempo", label: "Tiempo" },
  { to: "/w/$workspaceSlug/reports/plan-vs-real", label: "Plan vs. real" },
] as const;

function ReportsLayout() {
  const { workspaceSlug } = Route.useParams();
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-4">
        <h1 className="text-sm font-semibold">Reportes</h1>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              params={{ workspaceSlug }}
              activeOptions={{ exact: "exact" in t }}
              className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-muted/50"
              activeProps={{
                className: "text-xs px-2 py-1 rounded bg-muted text-foreground font-medium",
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
