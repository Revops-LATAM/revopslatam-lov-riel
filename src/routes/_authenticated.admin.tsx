import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { amISuperAdmin } from "@/lib/api/me.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Ajustes del sistema · Riel" }] }),
  beforeLoad: async () => {
    const res = await amISuperAdmin();
    if (!res.isSuperAdmin) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = "/admin";

  const tabs = [
    { to: `${base}/users`, label: "Usuarios y permisos" },
    { to: `${base}/permissions`, label: "Plantillas de permisos" },
    { to: `${base}/system`, label: "Configuración técnica" },
    { to: `${base}/import`, label: "Importar sistema comercial" },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-2">
        <h1 className="text-sm font-semibold">Ajustes del sistema</h1>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
          Super admin
        </span>
      </header>
      <nav className="border-b border-border px-6 flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
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
