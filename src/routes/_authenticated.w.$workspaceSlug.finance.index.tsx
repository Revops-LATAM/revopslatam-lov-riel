import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { wsBySlugQO, financeDashboardQO } from "@/lib/api/tasko.queries";
import { RouteError } from "@/components/tasko/RouteError";
import { formatMoney } from "@/lib/tasko-utils";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await context.queryClient.ensureQueryData(financeDashboardQO(ws.id));
    return null;
  },
  errorComponent: RouteError,
  component: FinanceDashboard,
});

function FinanceDashboard() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data } = useSuspenseQuery(financeDashboardQO(ws.id));
  const currencies = Object.keys(data.byCurrency ?? {});

  const fmt = (n: number, cur: string) => formatMoney(n, cur);

  return (
    <div className="p-6 space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Resumen</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Pagos vencidos" value={String(data.overdueCount ?? 0)} tone="warn" />
          <Card label="Pagos próximos" value={String(data.upcomingCount ?? 0)} />
          <Card label="Pagados" value={String(data.byStatus?.paid ?? 0)} tone="ok" />
          <Card label="Programados" value={String(data.byStatus?.scheduled ?? 0)} />
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Por moneda</h2>
        {currencies.length === 0 ? (
          <div className="border border-dashed border-border rounded-md p-8 text-center text-sm text-muted-foreground">
            Aún no hay pagos registrados en este workspace.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {currencies.map((cur) => {
              const v = data.byCurrency[cur];
              return (
                <div key={cur} className="border border-border rounded-md p-4">
                  <div className="text-xs text-muted-foreground mb-2">{cur}</div>
                  <div className="space-y-1">
                    <Row label="Programado" value={fmt(v.scheduled, cur)} />
                    <Row label="Pagado" value={fmt(v.paid, cur)} tone="ok" />
                    <Row label="Vencido" value={fmt(v.overdue, cur)} tone="warn" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color =
    tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="border border-border rounded-md p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color =
    tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}
