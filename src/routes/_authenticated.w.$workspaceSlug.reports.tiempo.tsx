import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { getTimeReport } from "@/lib/api/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { formatMinutes } from "@/components/tasko/TimeTab";
import { RouteError } from "@/components/tasko/RouteError";
import { formatMoney as fmtAmount } from "@/lib/tasko-utils";

type GroupBy = "project" | "member" | "client" | "phase";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/reports/tiempo")({
  ssr: false,
  head: () => ({ meta: [{ title: "Tiempo · Reportes · Riel" }] }),
  errorComponent: RouteError,
  component: TimeReportPage,
});

function TimeReportPage() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchReport = useServerFn(getTimeReport);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(format(subDays(today, 29), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [billableOnly, setBillableOnly] = useState(false);

  const reportQ = useQuery({
    queryKey: ["report", wsQ.data?.id, from, to, groupBy, billableOnly],
    queryFn: () =>
      fetchReport({
        data: { workspaceId: wsQ.data!.id, from, to, groupBy, billableOnly },
      }),
    enabled: !!wsQ.data?.id,
  });

  const exportCsv = () => {
    const header = [
      groupBy === "project" ? "Proyecto" : groupBy === "member" ? "Miembro" : groupBy === "phase" ? "Fase / Línea" : "Cliente",
      "Horas",
      "Horas facturables",
      "Monto",
      "Moneda",
    ];
    const rows = [header];
    for (const r of reportQ.data?.rows ?? []) {
      rows.push([
        r.label,
        (r.minutes / 60).toFixed(2),
        (r.billableMinutes / 60).toFixed(2),
        r.amount.toFixed(2),
        r.mixedCurrency ? "MIXED" : r.currency ?? "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${groupBy}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3 border border-border rounded-md p-3">
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="flex items-center gap-2 pb-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setFrom(format(subDays(today, d - 1), "yyyy-MM-dd"));
                setTo(format(today, "yyyy-MM-dd"));
              }}
            >
              {d}d
            </Button>
          ))}
        </div>
        <label className="text-xs inline-flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={billableOnly} onChange={(e) => setBillableOnly(e.target.checked)} />
          Sólo facturables
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs gap-1 ml-auto">
          <Download className="w-3 h-3" /> CSV
        </Button>
      </div>

      <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <TabsList>
          <TabsTrigger value="project">Por proyecto</TabsTrigger>
          <TabsTrigger value="member">Por miembro</TabsTrigger>
          <TabsTrigger value="client">Por cliente</TabsTrigger>
          <TabsTrigger value="phase">Por fase / línea</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
        <span>
          Rango:{" "}
          <span className="text-foreground">
            {format(new Date(from + "T00:00:00"), "dd/MM", { locale: es })} –{" "}
            {format(new Date(to + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
          </span>
        </span>
        <span>
          Total:{" "}
          <span className="text-foreground font-semibold">{formatMinutes(reportQ.data?.totals.minutes ?? 0)}</span>
        </span>
        <span>
          Facturable:{" "}
          <span className="text-foreground font-semibold">
            {formatMinutes(reportQ.data?.totals.billableMinutes ?? 0)}
          </span>
        </span>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-2">
                {groupBy === "project" ? "Proyecto" : groupBy === "member" ? "Miembro" : groupBy === "phase" ? "Fase / Línea" : "Cliente"}
              </th>
              <th className="p-2 text-right w-28">Horas</th>
              <th className="p-2 text-right w-32">Facturable</th>
              <th className="p-2 text-right w-32">Monto</th>
              <th className="p-2 text-right w-16">%</th>
            </tr>
          </thead>
          <tbody>
            {(reportQ.data?.rows ?? []).map((r) => {
              const totalMin = reportQ.data?.totals.minutes ?? 0;
              const pct = totalMin > 0 ? (r.minutes / totalMin) * 100 : 0;
              return (
                <tr key={r.key} className="border-t border-border hover:bg-muted/20">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {r.color && (
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                      )}
                      <span className="truncate">{r.label}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{(r.minutes / 60).toFixed(1)}h</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {(r.billableMinutes / 60).toFixed(1)}h
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.mixedCurrency ? (
                      <span className="text-status-in-progress" title="Monedas mezcladas">
                        mixto
                      </span>
                    ) : r.amount > 0 ? (
                      fmtAmount(r.amount, r.currency)
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{pct.toFixed(0)}%</td>
                </tr>
              );
            })}
            {(reportQ.data?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground italic">
                  Sin datos en el rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
