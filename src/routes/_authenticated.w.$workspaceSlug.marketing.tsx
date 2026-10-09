import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing")({
  ssr: false,
  head: () => ({ meta: [{ title: "Marketing · Riel" }] }),
  loader: async ({ context, params }) => {
    const { requirePermission } = await import("@/lib/permissions-loader");
    await requirePermission(context.queryClient, params.workspaceSlug, [
      "marketing_view",
      "marketing_manage",
    ]);
    return null;
  },
  errorComponent: RouteError,
  component: () => <Outlet />,
});
