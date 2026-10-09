import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/me/settings")({
  head: () => ({ meta: [{ title: "Mi perfil · Riel" }] }),
  component: MeSettingsLayout,
});

function MeSettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = "/me/settings";

  const tabs = [
    { to: base, label: "Datos personales", exact: true },
    { to: `${base}/connections`, label: "Conexiones" },
    { to: `${base}/notifications`, label: "Notificaciones" },
    { to: `${base}/time`, label: "Mi tiempo y capacidad" },
    { to: `${base}/vacations`, label: "Días libres" },
    { to: `${base}/preferences`, label: "Preferencias" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Mi perfil</h1>
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
