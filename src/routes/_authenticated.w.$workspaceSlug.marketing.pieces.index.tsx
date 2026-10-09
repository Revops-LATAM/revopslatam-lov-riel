import { createFileRoute } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/pieces/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Piezas · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: PiecesList,
});

function PiecesList() {
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center">
        <h1 className="text-sm font-semibold">Piezas</h1>
      </header>
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Bandeja de piezas sueltas — Paso 2
      </div>
    </div>
  );
}
