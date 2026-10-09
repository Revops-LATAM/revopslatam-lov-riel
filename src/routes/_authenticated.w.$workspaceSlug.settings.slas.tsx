import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { SlasSection } from "@/components/tasko/settings/SlasSection";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/slas")({
  head: () => ({ meta: [{ title: "SLAs · Riel" }] }),
  component: SettingsSlas,
});

function SettingsSlas() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const ws = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  if (!ws.data) return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  return (
    <div className="p-6 max-w-4xl">
      <SlasSection workspaceId={ws.data.id} />
    </div>
  );
}
