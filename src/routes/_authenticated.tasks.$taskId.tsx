import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { resolveTaskLocation } from "@/lib/api/tasks.functions";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Abriendo tarea · Riel" }] }),
  component: TaskRedirect,
});

function TaskRedirect() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const resolve = useServerFn(resolveTaskLocation);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loc = await resolve({ data: { taskId } });
        if (cancelled) return;
        if (!loc) {
          navigate({ to: "/my-tasks" });
          return;
        }
        const base =
          loc.area === "marketing"
            ? "/w/$workspaceSlug/marketing/projects/$projectId"
            : loc.area === "internal"
              ? "/w/$workspaceSlug/internal/projects/$projectId"
              : "/w/$workspaceSlug/projects/$projectId";
        navigate({
          to: base,
          params: { workspaceSlug: loc.workspaceSlug, projectId: loc.projectId },
          search: { task: taskId },
        });
      } catch {
        if (!cancelled) navigate({ to: "/my-tasks" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, navigate, resolve]);

  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Abriendo tarea...
    </div>
  );
}
