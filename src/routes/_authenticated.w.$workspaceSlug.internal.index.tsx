import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Coffee,
  Users,
  GraduationCap,
  CalendarHeart,
  Settings as SettingsIcon,
  Folder,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listInternalCategories, listInternalProjects } from "@/lib/api/internal.functions";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/internal/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Interno · Riel" }] }),
  errorComponent: RouteError,
  component: InternalHome,
});

const ICON_BY_KEY: Record<string, React.ComponentType<{ className?: string }>> = {
  reuniones: Users,
  formacion: GraduationCap,
  eventos: CalendarHeart,
  admin: SettingsIcon,
};

function InternalHome() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchCats = useServerFn(listInternalCategories);
  const fetchProjects = useServerFn(listInternalProjects);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const catsQ = useQuery({
    queryKey: ["internal-cats", wsQ.data?.id],
    queryFn: () => fetchCats({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });
  const projsQ = useQuery({
    queryKey: ["internal-projects", wsQ.data?.id],
    queryFn: () => fetchProjects({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const projectCountByCat = new Map<string, number>();
  for (const p of projsQ.data ?? []) {
    if (!p.internal_category_id) continue;
    projectCountByCat.set(
      p.internal_category_id,
      (projectCountByCat.get(p.internal_category_id) ?? 0) + 1,
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center gap-2">
        <Coffee className="w-4 h-4 text-sky-500" />
        <h1 className="text-sm font-semibold">Espacio Interno</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Aquí registramos el tiempo no facturable del equipo: reuniones internas, formación,
          eventos y procesos. Cada proyecto interno pertenece a una categoría y suma a la carga
          total de cada persona junto con las tareas operativas.
        </p>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Categorías
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {(catsQ.data ?? []).map((c) => {
              const Icon = ICON_BY_KEY[c.key] ?? Folder;
              const count = projectCountByCat.get(c.id) ?? 0;
              return (
                <Link
                  key={c.id}
                  to="/w/$workspaceSlug/internal/categories/$key"
                  params={{ workspaceSlug, key: c.key }}
                  className="rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        background: `${c.color ?? "#0ea5e9"}22`,
                        color: c.color ?? "#0ea5e9",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {count} {count === 1 ? "proyecto" : "proyectos"}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Proyectos recientes
          </h2>
          {(projsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Aún no hay proyectos internos. Crea uno desde una categoría.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {(projsQ.data ?? []).slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link
                    to="/w/$workspaceSlug/internal/projects/$projectId"
                    params={{ workspaceSlug, projectId: p.id }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.color ?? "#0ea5e9" }}
                    />
                    <span className="text-sm truncate flex-1">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
