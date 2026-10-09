import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { workspacesQO } from "@/lib/api/tasko.queries";
import { CalendarConnectionSection } from "@/components/tasko/settings/CalendarConnectionSection";

export const Route = createFileRoute("/_authenticated/me/settings/connections")({
  component: MeConnections,
});

function MeConnections() {
  const workspaces = useQuery(workspacesQO());
  // La conexión de Google Calendar es per-user-per-workspace; usamos el primer
  // workspace operations al que pertenece el usuario como ámbito por defecto.
  const ws = workspaces.data?.find((w) => w.kind === "operations") ?? workspaces.data?.[0];

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold">Conexiones</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Integraciones personales que solo tú ves y administras.
        </p>
      </div>
      {ws ? (
        <CalendarConnectionSection workspaceId={ws.id} />
      ) : (
        <div className="text-xs text-muted-foreground">Cargando workspace…</div>
      )}
    </div>
  );
}
