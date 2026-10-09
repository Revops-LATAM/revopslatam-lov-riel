import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/")({
  component: SettingsGeneral,
});

function SettingsGeneral() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const ws = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <section className="border border-border rounded-md p-4 space-y-2">
        <h2 className="text-sm font-semibold">Espacio de trabajo</h2>
        <div className="text-sm text-muted-foreground space-y-0.5">
          <div>
            <span className="text-foreground">Nombre:</span> {ws.data?.name}
          </div>
          <div>
            <span className="text-foreground">Slug:</span> {ws.data?.slug}
          </div>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Los datos personales, conexiones (Google Calendar) y preferencias se gestionan ahora en{" "}
        <a href="/me/settings" className="text-primary hover:underline">
          Mi perfil
        </a>
        .
      </p>
    </div>
  );
}
