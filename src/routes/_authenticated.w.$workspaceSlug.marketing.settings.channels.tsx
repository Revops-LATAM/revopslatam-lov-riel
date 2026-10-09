import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceSlug/marketing/settings/channels",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Canales · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: ChannelsSettings,
});

function ChannelsSettings() {
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Canales editoriales</h1>
      </header>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Gestión de canales del workspace — Paso 1.1
      </div>
    </div>
  );
}
