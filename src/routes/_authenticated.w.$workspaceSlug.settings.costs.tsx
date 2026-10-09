import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/costs")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceSlug/finance/settings/costs",
      params: { workspaceSlug: params.workspaceSlug },
      replace: true,
    });
  },
});
