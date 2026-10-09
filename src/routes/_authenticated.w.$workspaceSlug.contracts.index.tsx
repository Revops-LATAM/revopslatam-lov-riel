import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/contracts/")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceSlug/finance/contracts",
      params: { workspaceSlug: params.workspaceSlug },
    });
  },
});
