import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/emisor")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceSlug/finance/settings/emisor",
      params: { workspaceSlug: params.workspaceSlug },
      replace: true,
    });
  },
});
