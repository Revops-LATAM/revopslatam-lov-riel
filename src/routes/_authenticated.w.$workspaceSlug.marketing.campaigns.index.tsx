import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Plus, Search, Archive } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { listCampaigns } from "@/lib/api/marketing-campaigns.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/tasko/marketing/CreateCampaignDialog";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/campaigns/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Campañas · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: CampaignsList,
});

const STATUS_ORDER = ["planning", "in_execution", "live", "measuring", "idea", "closed"] as const;
const STATUS_LABEL: Record<string, string> = {
  idea: "Ideas",
  planning: "En planificación",
  in_execution: "En ejecución",
  live: "Live",
  measuring: "Midiendo resultados",
  closed: "Cerradas",
};
const STATUS_CLS: Record<string, string> = {
  idea: "bg-muted text-muted-foreground",
  planning: "bg-blue-500/15 text-blue-400",
  in_execution: "bg-violet-500/15 text-violet-400",
  live: "bg-emerald-500/15 text-emerald-400",
  measuring: "bg-amber-500/15 text-amber-400",
  closed: "bg-muted text-muted-foreground",
};

function CampaignsList() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const listFn = useServerFn(listCampaigns);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const listQ = useQuery({
    queryKey: ["campaigns", wsQ.data?.id, showArchived],
    queryFn: () =>
      listFn({ data: { workspaceId: wsQ.data!.id, includeArchived: showArchived } }),
    enabled: !!wsQ.data?.id,
  });

  const grouped = useMemo(() => {
    const rows = (listQ.data ?? []).filter((c) =>
      query.trim() ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
    );
    const map: Record<string, typeof rows> = {};
    for (const r of rows) {
      (map[r.status] ??= []).push(r);
    }
    return map;
  }, [listQ.data, query]);

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className="w-4 h-4 text-pink-400 shrink-0" />
          <h1 className="text-sm font-semibold truncate">Campañas</h1>
          <span className="text-xs text-muted-foreground shrink-0">
            {listQ.data?.length ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar campaña…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="w-3.5 h-3.5 mr-1" />
            {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Nueva campaña
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {listQ.isLoading && (
            <div className="text-xs text-muted-foreground py-12 text-center">Cargando…</div>
          )}
          {listQ.data && listQ.data.length === 0 && (
            <div className="rounded-md border border-dashed border-border py-16 text-center">
              <Megaphone className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <div className="text-sm font-medium">Aún no hay campañas</div>
              <div className="text-xs text-muted-foreground mt-1">
                Crea tu primera campaña — puedes partir desde un template.
              </div>
              <Button size="sm" className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nueva campaña
              </Button>
            </div>
          )}

          {STATUS_ORDER.map((st) => {
            const rows = grouped[st];
            if (!rows || rows.length === 0) return null;
            return (
              <section key={st} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_CLS[st]}`}
                  >
                    {STATUS_LABEL[st]}
                  </span>
                  <span className="text-xs text-muted-foreground">{rows.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rows.map((c) => (
                    <CampaignCard
                      key={c.id}
                      workspaceSlug={workspaceSlug}
                      c={c}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {creating && wsQ.data && (
        <CreateCampaignDialog
          workspaceId={wsQ.data.id}
          workspaceSlug={workspaceSlug}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CampaignCard({
  workspaceSlug,
  c,
}: {
  workspaceSlug: string;
  c: {
    id: string;
    name: string;
    color: string;
    status: string;
    launch_date: string | null;
    end_date: string | null;
    kpi_label: string | null;
    kpi_target: number | null;
    kpi_actual: number | null;
    channels: string[];
    archived: boolean;
  };
}) {
  const launch = c.launch_date ? new Date(c.launch_date) : null;
  const days = launch ? Math.ceil((launch.getTime() - Date.now()) / 86400000) : null;
  const pct =
    c.kpi_target && c.kpi_actual
      ? Math.min(100, (Number(c.kpi_actual) / Number(c.kpi_target)) * 100)
      : 0;
  return (
    <Link
      to="/w/$workspaceSlug/marketing/campaigns/$campaignId"
      params={{ workspaceSlug, campaignId: c.id }}
      className="block rounded-md border border-border bg-card hover:bg-accent/30 transition-colors p-3"
    >
      <div className="flex items-start gap-2">
        <div className="w-1 self-stretch rounded-full" style={{ background: c.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium truncate">
              {c.name}
              {c.archived && (
                <span className="ml-2 text-[10px] text-muted-foreground">(archivada)</span>
              )}
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {launch
              ? `${launch.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}${
                  c.end_date
                    ? ` → ${new Date(c.end_date).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}`
                    : ""
                }`
              : "Sin fecha"}
            {days !== null && days > 0 && ` · en ${days}d`}
            {days !== null && days === 0 && " · hoy"}
          </div>
          {c.kpi_label && c.kpi_target && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{c.kpi_label}</span>
                <span className="font-medium tabular-nums">
                  {c.kpi_actual ?? 0}/{c.kpi_target}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: c.color }}
                />
              </div>
            </div>
          )}
          {c.channels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {c.channels.slice(0, 5).map((ch) => (
                <span
                  key={ch}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {ch}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
