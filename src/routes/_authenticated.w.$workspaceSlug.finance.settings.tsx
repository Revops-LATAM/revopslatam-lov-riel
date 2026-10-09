import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/settings")({
  head: () => ({ meta: [{ title: "Ajustes de Finanzas · Riel" }] }),
  component: FinanceSettingsLayout,
});

function FinanceSettingsLayout() {
  const { workspaceSlug } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/w/${workspaceSlug}/finance/settings`;

  const tabs = [
    { to: base, label: "General", exact: true },
    { to: `${base}/emisor`, label: "Datos del emisor" },
    { to: `${base}/dte`, label: "Facturación electrónica" },
    { to: `${base}/costs`, label: "Costos por hora" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Ajustes de Finanzas</h1>
      </header>
      <nav className="border-b border-border px-6 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
