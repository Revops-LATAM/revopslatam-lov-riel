import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { getPlanVsActualReport } from "@/lib/api/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { RouteError } from "@/components/tasko/RouteError";

type GroupBy = "member" | "task_type" | "contract" | "client" | "project" | "phase";

const GROUP_LABEL: Record<GroupBy, string> = {
  member: "Persona",
  task_type: "Tipo de actividad",
  contract: "Contrato",
  client: "Cliente",
  project: "Proyecto",
  phase: "Fase / Línea",
};

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/reports/plan-vs-real")({
  ssr: false,
  head: () => ({ meta: [{ title: "Plan vs. real · Reportes · Riel" }] }),
  errorComponent: RouteError,
  component: PlanVsActualPage,
});

function PlanVsActualPage() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchReport = useServerFn(getPlanVsActualReport);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<GroupBy>("member");
  const [excludeInternal, setExcludeInternal] = useState(false);

  const q = useQuery({
    queryKey: ["plan-vs-real", wsQ.data?.id, from, to, groupBy, excludeInternal],
    queryFn: () =>
      fetchReport({
        data: { workspaceId: wsQ.data!.id, from, to, groupBy, excludeInternal },
      }),
    enabled: !!wsQ.data?.id,
  });

  const rows = q.data?.rows ?? [];
  const totals = q.data?.totals ?? { estimateHours: 0, loggedHours: 0 };
  const totalDelta = totals.loggedHours - totals.estimateHours;

  const exportCsv = () => {
    const out: string[][] = [[GROUP_LABEL[groupBy], "Estimado (h)", "Registrado (h)", "Desviación (h)", "Desviación (%)"]];
    for (const r of rows) {
      const d = r.loggedHours - r.estimateHours;
      out.push([
        r.label,
        r.estimateHours.toFixed(2),
        r.loggedHours.toFixed(2),
        d.toFixed(2),
        r.estimateHours > 0 ? ((d / r.estimateHours) * 100).toFixed(1) : "",
      ]);
    }
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-vs-real-${groupBy}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRange = (s: Date, e: Date) => {
    setFrom(format(s, "yyyy-MM-dd"));
    setTo(format(e, "yyyy-MM-dd"));
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
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRange(subDays(today, 29), today)}>
            30d
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRange(startOfMonth(today), today)}>
            Mes actual
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              setRange(startOfMonth(prev), endOfMonth(prev));
            }}
          >
            Mes anterior
          </Button>
        </div>
        <label className="text-xs inline-flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={excludeInternal} onChange={(e) => setExcludeInternal(e.target.checked)} />
          Excluir interno
        </label>
        <Button size="sm" variant="outline" onClick={exportCsv} className="h-7 text-xs gap-1 ml-auto">
          <Download className="w-3 h-3" /> CSV
        </Button>
      </div>

      <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <TabsList>
          <TabsTrigger value="member">Persona</TabsTrigger>
          <TabsTrigger value="task_type">Tipo de actividad</TabsTrigger>
          <TabsTrigger value="contract">Contrato</TabsTrigger>
          <TabsTrigger value="client">Cliente</TabsTrigger>
          <TabsTrigger value="project">Proyecto</TabsTrigger>
          <TabsTrigger value="phase">Fase / Línea</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
        <span>
          Rango:{" "}
          <span className="text-foreground">
            {format(new Date(from + "T00:00:00"), "dd/MM/yyyy", { locale: es })} –{" "}
            {format(new Date(to + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
          </span>
        </span>
        <span>
          Estimado: <span className="text-foreground font-semibold">{totals.estimateHours.toFixed(1)}h</span>
        </span>
        <span>
          Registrado: <span className="text-foreground font-semibold">{totals.loggedHours.toFixed(1)}h</span>
        </span>
        <span>
          Desviación:{" "}
          <span className={totalDelta > 0 ? "text-destructive font-semibold" : "text-foreground font-semibold"}>
            {totalDelta >= 0 ? "+" : ""}
            {totalDelta.toFixed(1)}h
          </span>
        </span>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-2">{GROUP_LABEL[groupBy]}</th>
              <th className="p-2 text-right w-28">Estimado</th>
              <th className="p-2 text-right w-28">Registrado</th>
              <th className="p-2 text-right w-28">Desviación</th>
              <th className="p-2 text-right w-20">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.loggedHours - r.estimateHours;
              const pct = r.estimateHours > 0 ? (d / r.estimateHours) * 100 : null;
              return (
                <tr key={r.key} className="border-t border-border hover:bg-muted/20">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {r.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />}
                      <span className="truncate">{r.label}</span>
                      {r.sublabel && <span className="text-xs text-muted-foreground truncate">· {r.sublabel}</span>}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{r.estimateHours.toFixed(1)}h</td>
                  <td className="p-2 text-right tabular-nums">{r.loggedHours.toFixed(1)}h</td>
                  <td className={`p-2 text-right tabular-nums ${d > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {d >= 0 ? "+" : ""}
                    {d.toFixed(1)}h
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground italic">
                  {q.isLoading ? "Cargando…" : "Sin datos en el rango."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        El estimado se prorratea por días hábiles del rango de fechas de cada tarea y se divide en partes iguales
        entre sus asignados. Se excluyen tareas canceladas.
      </p>
    </div>
  );
}
