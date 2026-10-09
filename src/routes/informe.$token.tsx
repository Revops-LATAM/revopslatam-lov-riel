import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type Task = {
  id: string;
  title: string;
  status: string | null;
  statusColor: string | null;
  estimated: number;
  actual: number;
};

type Sprint = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  status: string;
  contractedHours: number | null;
  estimated: number;
  actual: number;
  tasks: Task[];
};

type ReportData = {
  project: { id: string; name: string; client_name: string | null; hours_per_sprint: number | null };
  sprints: Sprint[];
  backlog?: Task[] | null;
};

export const Route = createFileRoute("/informe/$token")({
  ssr: false,
  component: PublicReportPage,
});

function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

function h(n: number) {
  return `${n.toFixed(1)} h`;
}

function PublicReportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<
    { s: "loading" } | { s: "error"; message: string } | { s: "ready"; data: ReportData }
  >({ s: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/report/${token}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const text = await res.text();
          if (!cancelled) setState({ s: "error", message: text || `Error ${res.status}` });
          return;
        }
        const json = (await res.json()) as ReportData;
        if (!cancelled) setState({ s: "ready", data: json });
      } catch (e) {
        if (!cancelled)
          setState({ s: "error", message: e instanceof Error ? e.message : "Error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.s === "loading") {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground text-sm">
        Cargando informe…
      </div>
    );
  }
  if (state.s === "error") {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
        No pudimos cargar este informe: {state.message}
      </div>
    );
  }

  const { project, sprints } = state.data;
  const backlog = state.data.backlog ?? null;
  const totalEst = sprints.reduce((a, s) => a + s.estimated, 0);
  const totalAct = sprints.reduce((a, s) => a + s.actual, 0);
  const range =
    sprints.length > 0
      ? `${fmt(sprints[0].startDate)} — ${fmt(sprints[sprints.length - 1].endDate)}`
      : "—";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10 print:py-4">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Informe de horas
            </p>
            {project.client_name && (
              <h1 className="text-2xl font-semibold mt-1">{project.client_name}</h1>
            )}
            <p
              className={
                project.client_name
                  ? "text-base font-medium text-foreground/80 mt-0.5"
                  : "text-2xl font-semibold mt-1"
              }
            >
              {project.name}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{range}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir / PDF
          </Button>
        </header>

        <section className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Resumen por sprint</h2>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Sprint</th>
                  <th className="text-left font-medium px-3 py-2">Fechas</th>
                  <th className="text-right font-medium px-3 py-2">Contratadas</th>
                  <th className="text-right font-medium px-3 py-2">Planificadas</th>
                  <th className="text-right font-medium px-3 py-2">Reales</th>
                  <th className="text-right font-medium px-3 py-2">Consumo</th>
                  <th className="text-right font-medium px-3 py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {sprints.map((s) => {
                  const base = s.contractedHours ?? s.estimated;
                  const pct = base > 0 ? Math.round((s.actual / base) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">Sprint {s.number}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fmt(s.startDate)} — {fmt(s.endDate)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {s.contractedHours ? h(s.contractedHours) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{h(s.estimated)}</td>
                      <td className="px-3 py-2 text-right font-medium">{h(s.actual)}</td>
                      <td className="px-3 py-2 text-right">{base > 0 ? `${pct}%` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {base > 0 ? h(base - s.actual) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right">{h(totalEst)}</td>
                  <td className="px-3 py-2 text-right">{h(totalAct)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 space-y-6">
          <h2 className="text-sm font-semibold">Detalle de tareas</h2>
          {sprints.map((s) => (
            <div key={s.id} className="rounded border border-border overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                Sprint {s.number} · {fmt(s.startDate)} — {fmt(s.endDate)} · {h(s.actual)} reales
              </div>
              {s.tasks.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  Sin tareas registradas en este sprint.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-t border-border">
                      <th className="text-left font-medium px-3 py-1.5">Tarea</th>
                      <th className="text-left font-medium px-3 py-1.5">Estado</th>
                      <th className="text-right font-medium px-3 py-1.5">Estimadas</th>
                      <th className="text-right font-medium px-3 py-1.5">Reales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.tasks.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-3 py-1.5">{t.title}</td>
                        <td className="px-3 py-1.5">
                          {t.status ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs"
                              style={{ color: t.statusColor ?? undefined }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: t.statusColor ?? "currentColor" }}
                              />
                              {t.status}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">{h(t.estimated)}</td>
                        <td className="px-3 py-1.5 text-right">{h(t.actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>

        {backlog && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">Backlog (por definir)</h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Tareas solicitadas que aún no están asignadas a un sprint.
            </p>
            <div className="rounded border border-border overflow-hidden">
              {backlog.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No hay tareas pendientes por definir.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/50">
                    <tr>
                      <th className="text-left font-medium px-3 py-1.5">Tarea</th>
                      <th className="text-left font-medium px-3 py-1.5">Estado</th>
                      <th className="text-right font-medium px-3 py-1.5">Estimadas</th>
                      <th className="text-right font-medium px-3 py-1.5">Reales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlog.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-3 py-1.5">{t.title}</td>
                        <td className="px-3 py-1.5">
                          {t.status ? (
                            <span
                              className="inline-flex items-center gap-1.5 text-xs"
                              style={{ color: t.statusColor ?? undefined }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: t.statusColor ?? "currentColor" }}
                              />
                              {t.status}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">{h(t.estimated)}</td>
                        <td className="px-3 py-1.5 text-right">{h(t.actual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}



        <footer className="mt-10 pt-4 border-t border-border text-xs text-muted-foreground">
          Informe generado por Riel · Revops LATAM
        </footer>
      </div>
    </div>
  );
}
