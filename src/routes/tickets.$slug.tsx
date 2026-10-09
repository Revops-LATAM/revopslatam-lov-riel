import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tickets/$slug")({
  ssr: false,
  component: () => <Outlet />,
});
