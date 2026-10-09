import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";

// Interno es visible para todos los miembros del workspace por defecto.
export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/internal")({
  ssr: false,
  head: () => ({ meta: [{ title: "Interno · Riel" }] }),
  errorComponent: RouteError,
  component: () => <Outlet />,
});
