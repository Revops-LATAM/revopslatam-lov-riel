import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/dte")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceSlug/finance/settings/dte",
      params: { workspaceSlug: params.workspaceSlug },
      replace: true,
    });
  },
});
