import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Megaphone, FileText, AlertTriangle, ArrowRight } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import { getMarketingDashboard } from "@/lib/api/marketing-campaigns.functions";
import { CreateMarketingItemMenu } from "@/components/tasko/marketing/CreateMarketingItemMenu";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: MarketingHome,
});

function MarketingHome() {
  const { workspaceSlug } = Route.useParams();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchDash = useServerFn(getMarketingDashboard);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const dashQ = useQuery({
    queryKey: ["marketing-dashboard", wsQ.data?.id],
    queryFn: () => fetchDash({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const dash = dashQ.data;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-pink-400" />
          <h1 className="text-sm font-semibold">Marketing</h1>
        </div>
        {wsQ.data && (
          <CreateMarketingItemMenu workspaceId={wsQ.data.id} workspaceSlug={workspaceSlug} />
        )}
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Overdue alert */}
          {dash && dash.overduePieces.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-amber-100">
                  {dash.overduePieces.length} pieza{dash.overduePieces.length !== 1 && "s"} atrasada{dash.overduePieces.length !== 1 && "s"}
                </div>
                <div className="text-xs text-amber-200/80 mt-0.5">
                  {dash.overduePieces.slice(0, 3).map((p) => p.title).join(" · ")}
                  {dash.overduePieces.length > 3 && ` y ${dash.overduePieces.length - 3} más`}
                </div>
              </div>
              <Link
                to="/w/$workspaceSlug/marketing/grilla"
                params={{ workspaceSlug }}
                className="text-xs text-amber-200 hover:text-amber-100 flex items-center gap-1 shrink-0"
              >
                Ver <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Grid: campañas + próximas piezas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Campañas activas */}
            <section className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Campañas activas
                </h2>
                <Link
                  to="/w/$workspaceSlug/marketing/campaigns"
                  params={{ workspaceSlug }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Ver todas <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {dashQ.isLoading ? (
                <div className="text-xs text-muted-foreground py-8 text-center">Cargando…</div>
              ) : !dash || dash.activeCampaigns.length === 0 ? (
                <EmptyState
                  icon={<Megaphone className="w-5 h-5" />}
                  title="Sin campañas activas"
                  desc="Crea tu primera campaña para coordinar lanzamientos y piezas."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dash.activeCampaigns.map((c) => (
                    <CampaignSummaryCard
                      key={c.id}
                      workspaceSlug={workspaceSlug}
                      campaign={c}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Próximas piezas */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Esta semana
                </h2>
                <Link
                  to="/w/$workspaceSlug/marketing/grilla"
                  params={{ workspaceSlug }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Calendario <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {dashQ.isLoading ? (
                <div className="text-xs text-muted-foreground py-8 text-center">Cargando…</div>
              ) : !dash || dash.upcomingPieces.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays className="w-5 h-5" />}
                  title="Sin publicaciones esta semana"
                  compact
                />
              ) : (
                <div className="space-y-1.5">
                  {dash.upcomingPieces.map((p) => (
                    <UpcomingPieceRow key={p.id} piece={p} />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignSummaryCard({
  workspaceSlug,
  campaign,
}: {
  workspaceSlug: string;
  campaign: {
    id: string;
    name: string;
    status: string;
    launch_date: string | null;
    color: string;
    kpi_label: string | null;
    kpi_target: number | null;
    kpi_actual: number | null;
    channels: string[];
  };
}) {
  const launch = campaign.launch_date ? new Date(campaign.launch_date) : null;
  const daysToLaunch = launch
    ? Math.ceil((launch.getTime() - Date.now()) / 86400000)
    : null;
  const pct =
    campaign.kpi_target && campaign.kpi_actual
      ? Math.min(100, (Number(campaign.kpi_actual) / Number(campaign.kpi_target)) * 100)
      : 0;

  return (
    <Link
      to="/w/$workspaceSlug/marketing/campaigns/$campaignId"
      params={{ workspaceSlug, campaignId: campaign.id }}
      className="block rounded-md border border-border bg-card hover:bg-accent/30 transition-colors p-3"
    >
      <div className="flex items-start gap-2">
        <div
          className="w-1 self-stretch rounded-full"
          style={{ background: campaign.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium truncate">{campaign.name}</div>
            <StatusBadge status={campaign.status} />
          </div>
          {daysToLaunch !== null && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {daysToLaunch > 0
                ? `Lanza en ${daysToLaunch}d`
                : daysToLaunch === 0
                  ? "Lanza hoy"
                  : `Hace ${Math.abs(daysToLaunch)}d`}
            </div>
          )}
          {campaign.kpi_label && campaign.kpi_target && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground">{campaign.kpi_label}</span>
                <span className="font-medium">
                  {campaign.kpi_actual ?? 0} / {campaign.kpi_target}
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: campaign.color }}
                />
              </div>
            </div>
          )}
          {campaign.channels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {campaign.channels.slice(0, 4).map((ch) => (
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

function UpcomingPieceRow({
  piece,
}: {
  piece: {
    id: string;
    title: string;
    channel: string;
    publish_at: string | null;
    status_editorial: string;
  };
}) {
  const d = piece.publish_at ? new Date(piece.publish_at) : null;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/30 group">
      <div className="text-[11px] text-muted-foreground w-14 shrink-0 tabular-nums">
        {d
          ? d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })
          : "—"}
      </div>
      <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{piece.title}</div>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{piece.channel}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    idea: { label: "Idea", cls: "bg-muted text-muted-foreground" },
    planning: { label: "Planificación", cls: "bg-blue-500/15 text-blue-400" },
    in_execution: { label: "En ejecución", cls: "bg-violet-500/15 text-violet-400" },
    live: { label: "Live", cls: "bg-emerald-500/15 text-emerald-400" },
    measuring: { label: "Medición", cls: "bg-amber-500/15 text-amber-400" },
    closed: { label: "Cerrada", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? map.idea;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  desc,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-dashed border-border ${compact ? "py-6" : "py-10"} px-4 text-center`}
    >
      <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-2">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
    </div>
  );
}
