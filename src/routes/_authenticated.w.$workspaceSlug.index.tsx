import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO, projectsQO } from "@/lib/api/tasko.queries";
import { Folder } from "lucide-react";
import { ProjectGridSkeleton } from "@/components/tasko/Skeletons";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Inicio · Riel" }] }),
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(projectsQO(ws.id));
    return null;
  },
  pendingComponent: () => (
    <div className="p-6">
      <ProjectGridSkeleton />
    </div>
  ),
  errorComponent: RouteError,
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: projects } = useSuspenseQuery(projectsQO(ws.id));

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Inicio</h1>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-1">Hola 👋</h2>
          <p className="text-sm text-muted-foreground">
            Bienvenido a {ws.name}. Tus proyectos activos:
          </p>
        </section>
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/w/$workspaceSlug/projects/$projectId"
              params={{ workspaceSlug, projectId: p.id }}
              preload="intent"
              className="border border-border rounded-md p-4 hover:border-primary/50 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: p.color ?? "#8b5cf6" }}
                />
                <span className="text-sm font-medium">{p.name}</span>
              </div>
              {p.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
              )}
            </Link>
          ))}
          {projects.length === 0 && (
            <Link
              to="/w/$workspaceSlug/projects"
              params={{ workspaceSlug }}
              className="border border-dashed border-border rounded-md p-6 text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              <Folder className="w-5 h-5 mx-auto mb-2" />
              Crea tu primer proyecto
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
