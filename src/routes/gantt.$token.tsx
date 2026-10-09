import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProjectGanttView } from "@/components/tasko/ProjectGanttView";

type ShareData = {
  project: { id: string; name: string; start_date: string | null; end_date: string | null };
  phases: Array<{ id: string; name: string; color: string | null; order_index: number }>;
  tasks: Array<{
    id: string;
    title: string;
    start_date: string | null;
    due_date: string | null;
    phase_id: string | null;
    task_statuses?: { color: string | null; name?: string | null } | null;
  }>;
  dependencies: Array<{ id: string; predecessor_task_id: string; successor_task_id: string }>;
};

export const Route = createFileRoute("/gantt/$token")({
  ssr: false,
  component: PublicGanttPage,
});

function PublicGanttPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: ShareData }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/gantt/${token}`);
        if (!res.ok) {
          const text = await res.text();
          if (!cancelled) setState({ status: "error", message: text || `Error ${res.status}` });
          return;
        }
        const json = (await res.json()) as ShareData;
        if (!cancelled) setState({ status: "ready", data: json });
      } catch (e) {
        if (!cancelled)
          setState({ status: "error", message: e instanceof Error ? e.message : "Error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground text-sm">
        Cargando…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-2 text-center px-6">
        <div className="text-lg font-semibold">Enlace no disponible</div>
        <div className="text-sm text-muted-foreground">{state.message}</div>
      </div>
    );
  }

  const { project, phases, tasks, dependencies } = state.data;
  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Vista compartida · Gantt
          </div>
          <h1 className="text-base font-semibold">{project.name}</h1>
        </div>
        <div className="text-xs text-muted-foreground">Solo lectura</div>
      </header>
      <div className="flex-1 overflow-hidden">
        <ProjectGanttView
          projectId={project.id}
          tasks={tasks}
          phases={phases}
          dependencies={dependencies}
          onOpenTask={() => {}}
        />
      </div>
    </div>
  );
}
