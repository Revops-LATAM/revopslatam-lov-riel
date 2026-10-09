import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { workspacesQO } from "@/lib/api/tasko.queries";

export const Route = createFileRoute("/_authenticated/me/settings/time")({
  component: MeTime,
});

function MeTime() {
  const workspaces = useQuery(workspacesQO());
  const ws =
    workspaces.data?.find((w) => w.kind === "operations") ??
    workspaces.data?.[0];

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold">Mi tiempo y capacidad</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tu capacidad y feriados son administrados por workspace.
        </p>
      </div>
      {ws ? (
        <Link
          to="/w/$workspaceSlug/time-settings"
          params={{ workspaceSlug: ws.slug }}
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          Ir a Tiempo y capacidad de “{ws.name}” →
        </Link>
      ) : (
        <div className="text-xs text-muted-foreground">Cargando…</div>
      )}
    </div>
  );
}
