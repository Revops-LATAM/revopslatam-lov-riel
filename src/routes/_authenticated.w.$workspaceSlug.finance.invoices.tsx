import { createFileRoute, redirect } from "@tanstack/react-router";

// Módulo unificado: Facturas emitidas ahora vive dentro de /finance/payments (Facturación).
export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/invoices")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceSlug/finance/payments",
      params: { workspaceSlug: params.workspaceSlug },
    });
  },
});
