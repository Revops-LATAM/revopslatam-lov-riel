import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Plus, Archive } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listMarketingProjects } from "@/lib/api/marketing-projects.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { CreateMarketingProjectDialog } from "@/components/tasko/marketing/CreateMarketingProjectDialog";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/projects/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Proyectos Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: MarketingProjectsList,
});

function MarketingProjectsList() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const listFn = useServerFn(listMarketingProjects);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const projectsQ = useQuery({
    queryKey: ["marketing-projects", wsQ.data?.id, showArchived],
    queryFn: () => listFn({ data: { workspaceId: wsQ.data!.id, includeArchived: showArchived } }),
    enabled: !!wsQ.data?.id,
  });

  const projects = projectsQ.data ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-pink-400" />
          <h1 className="text-sm font-semibold">Proyectos Marketing</h1>
          <span className="text-xs text-muted-foreground">{projects.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="w-3.5 h-3.5 mr-1" />
            {showArchived ? "Ocultar archivados" : "Ver archivados"}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo proyecto
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm text-muted-foreground max-w-2xl mb-6">
            Proyectos libres para trabajos internos de marketing que no encajan como campaña:
            rediseños, iniciativas de largo plazo, procesos, experimentación. Todo el tiempo
            registrado suma como interno no facturable.
          </p>

          {projectsQ.isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-12">Cargando…</div>
          ) : projects.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-16 text-center">
              <FolderKanban className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <div className="text-sm font-medium">Sin proyectos aún</div>
              <div className="text-xs text-muted-foreground mt-1">
                Crea un proyecto para organizar tareas libres en tablero o tabla.
              </div>
              <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo proyecto
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to="/w/$workspaceSlug/marketing/projects/$projectId"
                  params={{ workspaceSlug, projectId: p.id }}
                  className="rounded-md border border-border bg-card hover:bg-accent/30 transition-colors p-3"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-1 self-stretch rounded-full"
                      style={{ background: p.color ?? "#ec4899" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.name}
                        {p.archived && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            (archivado)
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {p.description}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && wsQ.data && (
        <CreateMarketingProjectDialog
          workspaceId={wsQ.data.id}
          workspaceSlug={workspaceSlug}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
