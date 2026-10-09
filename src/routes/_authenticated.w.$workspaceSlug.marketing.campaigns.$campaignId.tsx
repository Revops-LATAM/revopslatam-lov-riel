import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Megaphone,
  Plus,
  Target,
  Archive,
  Save,
  ExternalLink,
  Clock,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import {
  getCampaign,
  updateCampaign,
} from "@/lib/api/marketing-campaigns.functions";
import {
  listPiecesByCampaign,
  updatePiece,
} from "@/lib/api/marketing-pieces.functions";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreatePieceDialog } from "@/components/tasko/marketing/CreatePieceDialog";
import { PieceTimeDialog } from "@/components/tasko/marketing/PieceTimeDialog";

export const Route = createFileRoute(
  "/_authenticated/w/$workspaceSlug/marketing/campaigns/$campaignId",
)({
  ssr: false,
  head: () => ({ meta: [{ title: "Campaña · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: CampaignDetail,
});

const STATUSES = ["idea", "planning", "in_execution", "live", "measuring", "closed"] as const;
const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  planning: "Planificación",
  in_execution: "En ejecución",
  live: "Live",
  measuring: "Medición",
  closed: "Cerrada",
};

const PIECE_COLUMNS = [
  { key: "idea", label: "Idea" },
  { key: "draft", label: "Borrador" },
  { key: "in_review", label: "En revisión" },
  { key: "approved", label: "Aprobado" },
  { key: "scheduled", label: "Programado" },
  { key: "published", label: "Publicado" },
] as const;

type PieceStatus = (typeof PIECE_COLUMNS)[number]["key"];

function CampaignDetail() {
  const { workspaceSlug, campaignId } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const fetchCampaign = useServerFn(getCampaign);
  const fetchPieces = useServerFn(listPiecesByCampaign);
  const updateFn = useServerFn(updateCampaign);
  const updatePieceFn = useServerFn(updatePiece);

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });
  const campQ = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => fetchCampaign({ data: { campaignId } }),
  });
  const piecesQ = useQuery({
    queryKey: ["campaign-pieces", campaignId],
    queryFn: () => fetchPieces({ data: { campaignId } }),
  });

  const [creatingPiece, setCreatingPiece] = useState(false);

  const updateMut = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketing-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePieceMut = useMutation({
    mutationFn: updatePieceFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-pieces", campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = campQ.data;

  const groupedPieces = useMemo(() => {
    const map: Record<string, NonNullable<typeof piecesQ.data>> = {};
    for (const col of PIECE_COLUMNS) map[col.key] = [];
    for (const p of piecesQ.data ?? []) {
      if (map[p.status_editorial]) map[p.status_editorial].push(p);
    }
    return map;
  }, [piecesQ.data]);

  if (campQ.isLoading || !c) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
        Cargando…
      </div>
    );
  }

  const launch = c.launch_date ? new Date(c.launch_date) : null;
  const end = c.end_date ? new Date(c.end_date) : null;
  const daysToLaunch = launch
    ? Math.ceil((launch.getTime() - Date.now()) / 86400000)
    : null;
  const pct =
    c.kpi_target && c.kpi_actual
      ? Math.min(100, (Number(c.kpi_actual) / Number(c.kpi_target)) * 100)
      : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Link
            to="/w/$workspaceSlug/marketing/campaigns"
            params={{ workspaceSlug }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Campañas
          </Link>
        </div>
        <div className="flex items-start gap-3">
          <div
            className="w-1.5 self-stretch rounded-full mt-1"
            style={{ background: c.color }}
          />
          <div className="flex-1 min-w-0">
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name)
                  updateMut.mutate({ data: { campaignId, name: v } });
              }}
              className="text-lg font-semibold bg-transparent border-none outline-none w-full focus:ring-1 focus:ring-ring rounded px-1 -mx-1"
            />
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
              <Select
                value={c.status}
                onValueChange={(v) =>
                  updateMut.mutate({
                    data: {
                      campaignId,
                      status: v as (typeof STATUSES)[number],
                    },
                  })
                }
              >
                <SelectTrigger className="h-6 w-auto text-[11px] px-2 gap-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {launch && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {launch.toLocaleDateString("es-CL", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                  {end && (
                    <>
                      {" → "}
                      {end.toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </>
                  )}
                  {daysToLaunch !== null && daysToLaunch > 0 && (
                    <span className="text-pink-400 ml-1">· en {daysToLaunch}d</span>
                  )}
                </span>
              )}
              {c.channels && c.channels.length > 0 && (
                <span className="flex items-center gap-1">
                  {c.channels.slice(0, 6).map((ch) => (
                    <span
                      key={ch}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted"
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() =>
              updateMut.mutate({
                data: { campaignId, archived: !c.archived },
              })
            }
          >
            <Archive className="w-3.5 h-3.5 mr-1" />
            {c.archived ? "Desarchivar" : "Archivar"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          {/* KPI + fechas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiEditor
              label={c.kpi_label ?? ""}
              target={c.kpi_target ?? null}
              actual={c.kpi_actual ?? null}
              pct={pct}
              color={c.color}
              onSave={(kpiLabel, kpiTarget, kpiActual) =>
                updateMut.mutate({
                  data: { campaignId, kpiLabel, kpiTarget, kpiActual },
                })
              }
            />
            <DateEditor
              label="Lanzamiento"
              value={c.launch_date}
              onSave={(v) => updateMut.mutate({ data: { campaignId, launchDate: v } })}
            />
            <DateEditor
              label="Cierre"
              value={c.end_date}
              onSave={(v) => updateMut.mutate({ data: { campaignId, endDate: v } })}
            />
          </div>

          {/* Brief */}
          <BriefEditor
            value={c.brief_md ?? ""}
            objective={c.objective ?? ""}
            onSave={(briefMd, objective) =>
              updateMut.mutate({ data: { campaignId, briefMd, objective } })
            }
          />

          {/* Piezas */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Piezas de contenido</h2>
                <span className="text-xs text-muted-foreground">
                  {piecesQ.data?.length ?? 0}
                </span>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => setCreatingPiece(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Nueva pieza
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 min-h-[300px]">
              {PIECE_COLUMNS.map((col) => {
                const rows = groupedPieces[col.key] ?? [];
                return (
                  <div
                    key={col.key}
                    className="rounded-md bg-muted/30 border border-border p-2 flex flex-col min-h-[260px]"
                  >
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {col.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {rows.length}
                      </span>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {rows.map((p) => (
                        <PieceCard
                          key={p.id}
                          piece={p}
                          onMove={(newStatus) =>
                            updatePieceMut.mutate({
                              data: { pieceId: p.id, statusEditorial: newStatus },
                            })
                          }
                        />
                      ))}
                      {rows.length === 0 && (
                        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
                          —
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {creatingPiece && wsQ.data && (
        <CreatePieceDialog
          workspaceId={wsQ.data.id}
          defaultCampaignId={campaignId}
          onClose={() => setCreatingPiece(false)}
        />
      )}
    </div>
  );
}

function KpiEditor({
  label,
  target,
  actual,
  pct,
  color,
  onSave,
}: {
  label: string;
  target: number | null;
  actual: number | null;
  pct: number;
  color: string;
  onSave: (label: string, target: number | null, actual: number | null) => void;
}) {
  const [l, setL] = useState(label);
  const [t, setT] = useState(target?.toString() ?? "");
  const [a, setA] = useState(actual?.toString() ?? "");
  const dirty = l !== label || t !== (target?.toString() ?? "") || a !== (actual?.toString() ?? "");
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Target className="w-3.5 h-3.5 text-pink-400" /> KPI principal
      </div>
      <div className="space-y-2">
        <Input
          value={l}
          onChange={(e) => setL(e.target.value)}
          placeholder="Ej: MQLs generados"
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Actual</Label>
            <Input
              value={a}
              onChange={(e) => setA(e.target.value)}
              type="number"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Objetivo</Label>
            <Input
              value={t}
              onChange={(e) => setT(e.target.value)}
              type="number"
              className="h-8 text-xs"
            />
          </div>
        </div>
        {target && (
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
        )}
        {dirty && (
          <Button
            size="sm"
            className="h-7 text-xs w-full"
            onClick={() =>
              onSave(
                l,
                t.trim() === "" ? null : Number(t),
                a.trim() === "" ? null : Number(a),
              )
            }
          >
            <Save className="w-3 h-3 mr-1" /> Guardar
          </Button>
        )}
      </div>
    </div>
  );
}

function DateEditor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <CalendarDays className="w-3.5 h-3.5 text-pink-400" /> {label}
      </div>
      <Input
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const v = e.target.value || null;
          if (v !== value) onSave(v);
        }}
        className="h-8 text-xs"
      />
    </div>
  );
}

function BriefEditor({
  value,
  objective,
  onSave,
}: {
  value: string;
  objective: string;
  onSave: (brief: string, objective: string) => void;
}) {
  const [brief, setBrief] = useState(value);
  const [obj, setObj] = useState(objective);
  const dirty = brief !== value || obj !== objective;
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-3.5 h-3.5 text-pink-400" />
          <h2 className="text-sm font-semibold">Brief</h2>
        </div>
        {dirty && (
          <Button size="sm" className="h-7 text-xs" onClick={() => onSave(brief, obj)}>
            <Save className="w-3 h-3 mr-1" /> Guardar cambios
          </Button>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Objetivo
          </Label>
          <Textarea
            value={obj}
            onChange={(e) => setObj(e.target.value)}
            placeholder="¿Qué queremos lograr con esta campaña?"
            rows={2}
            className="text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Brief (markdown)
          </Label>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Audiencia · Mensaje clave · Tono · Referencias · Presupuesto…"
            rows={8}
            className="text-xs font-mono"
          />
        </div>
      </div>
    </section>
  );
}

function PieceCard({
  piece,
  onMove,
}: {
  piece: {
    id: string;
    title: string;
    channel: string;
    format: string | null;
    publish_at: string | null;
    status_editorial: string;
    url_published: string | null;
    color: string | null;
  };
  onMove: (newStatus: PieceStatus) => void;
}) {
  const [timeOpen, setTimeOpen] = useState(false);
  const d = piece.publish_at ? new Date(piece.publish_at) : null;
  return (
    <div className="rounded border border-border bg-card p-2 text-xs hover:border-pink-500/40 transition-colors group">
      <div className="flex items-start justify-between gap-1">
        <div className="text-xs font-medium leading-snug flex-1">{piece.title}</div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTimeOpen(true);
            }}
            className="text-muted-foreground hover:text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Registrar tiempo"
          >
            <Clock className="w-3 h-3" />
          </button>
          {piece.url_published && (
            <a
              href={piece.url_published}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 mt-1.5">
        <span className="text-[10px] text-muted-foreground truncate">
          {piece.channel}
          {piece.format && ` · ${piece.format}`}
        </span>
        {d && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
          </span>
        )}
      </div>
      <Select value={piece.status_editorial} onValueChange={(v) => onMove(v as PieceStatus)}>
        <SelectTrigger className="h-6 mt-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
          <SelectValue placeholder="Mover…" />
        </SelectTrigger>
        <SelectContent>
          {PIECE_COLUMNS.map((c) => (
            <SelectItem key={c.key} value={c.key} className="text-xs">
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {timeOpen && (
        <PieceTimeDialog
          pieceId={piece.id}
          pieceTitle={piece.title}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </div>
  );
}
