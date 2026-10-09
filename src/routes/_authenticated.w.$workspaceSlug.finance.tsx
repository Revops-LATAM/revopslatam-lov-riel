import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteError } from "@/components/tasko/RouteError";
import { requirePermission } from "@/lib/permissions-loader";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance")({
  ssr: false,
  head: () => ({ meta: [{ title: "Finanzas · Riel" }] }),
  loader: async ({ context, params }) => {
    await requirePermission(context.queryClient, params.workspaceSlug, [
      "finance_view",
      "finance_manage",
    ]);
    return null;
  },
  errorComponent: RouteError,
  component: FinanceLayout,
});

function FinanceLayout() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
