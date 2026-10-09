import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Loader2,
  Link2,
  CloudUpload,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/api/tasko.functions";
import {
  syncPieceToHubspot,
  unsyncPieceFromHubspot,
  syncMonthToHubspot,
} from "@/lib/api/hubspot-grilla.functions";
import { HubspotConfigDialog } from "@/components/tasko/marketing/grilla/HubspotConfigDialog";
import {
  getGrid,
  createPiece,
  updatePiece,
  deletePiece,
  listCadenceTemplates,
  listPillars,
  PIECE_CHANNELS,
} from "@/lib/api/grilla.functions";
import { RouteError } from "@/components/tasko/RouteError";

import { Button } from "@/components/ui/button";
import {
  CHANNEL_LABEL,
  CHANNEL_META,
  MONTH_NAMES,
  type CopiesByPiece,
  type PieceRow,
  type PiecePatch,
} from "@/components/tasko/marketing/grilla/constants";
import { EmptyGrilla } from "@/components/tasko/marketing/grilla/EmptyGrilla";
import { GenerateDialog } from "@/components/tasko/marketing/grilla/GenerateDialog";
import { GrillaRow } from "@/components/tasko/marketing/grilla/GrillaRow";
import { CopiesInline } from "@/components/tasko/marketing/grilla/CopiesInline";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/marketing/grilla")({
  ssr: false,
  head: () => ({ meta: [{ title: "Grilla · Marketing · Riel" }] }),
  errorComponent: RouteError,
  component: GrillaRoute,
});

type GridData = {
  grid: unknown;
  pieces: PieceRow[];
  copies: { piece_id: string; channel: string; body: string; hashtags: string[] }[];
};

function GrillaRoute() {
  const { workspaceSlug } = Route.useParams();
  const qc = useQueryClient();
  const fetchWs = useServerFn(getWorkspaceBySlug);
  const getGridFn = useServerFn(getGrid);
  const listTplsFn = useServerFn(listCadenceTemplates);
  const listPillarsFn = useServerFn(listPillars);
  const createFn = useServerFn(createPiece);
  const updateFn = useServerFn(updatePiece);
  const deleteFn = useServerFn(deletePiece);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [showGenerate, setShowGenerate] = useState(false);
  const [showHubspot, setShowHubspot] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const syncFn = useServerFn(syncPieceToHubspot);
  const unsyncFn = useServerFn(unsyncPieceFromHubspot);
  const syncMonthFn = useServerFn(syncMonthToHubspot);

  const toggleExpanded = useCallback(
    (id: string) => setOpenRowId((prev) => (prev === id ? null : id)),
    [],
  );

  const wsQ = useQuery({
    queryKey: ["ws", workspaceSlug],
    queryFn: () => fetchWs({ data: { slug: workspaceSlug } }),
  });

  const gridKey = useMemo(
    () => ["grid", wsQ.data?.id, year, month] as const,
    [wsQ.data?.id, year, month],
  );

  const gridQ = useQuery({
    queryKey: gridKey,
    queryFn: () => getGridFn({ data: { workspaceId: wsQ.data!.id, year, month } }),
    enabled: !!wsQ.data?.id,
  });
  const tplsQ = useQuery({
    queryKey: ["cadence-templates", wsQ.data?.id],
    queryFn: () => listTplsFn({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });
  const pillarsQ = useQuery({
    queryKey: ["pillars", wsQ.data?.id],
    queryFn: () => listPillarsFn({ data: { workspaceId: wsQ.data!.id } }),
    enabled: !!wsQ.data?.id,
  });

  const pillars = pillarsQ.data ?? [];
  const pillarMap = useMemo(() => {
    const m = new Map<string, { label: string; color: string | null }>();
    pillars.forEach((p) => m.set(p.id, { label: p.label, color: p.color }));
    return m;
  }, [pillars]);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ["grid"] }), [qc]);

  /** Optimistic in-place patch of a piece — avoids full refetch on every edit. */
  const applyLocalPatch = useCallback(
    (id: string, patch: PiecePatch) => {
      qc.setQueryData<GridData>(gridKey, (prev) => {
        if (!prev) return prev;
        const nextPieces = prev.pieces.map((p) => {
          if (p.id !== id) return p;
          const merged: PieceRow = { ...p };
          if (patch.title !== undefined) merged.title = patch.title;
          if (patch.publishAt !== undefined) merged.publish_at = patch.publishAt;
          if (patch.format !== undefined) merged.format = patch.format;
          if (patch.channels !== undefined) merged.channels = patch.channels;
          if (patch.pillarId !== undefined) merged.pillar_id = patch.pillarId;
          if (patch.status !== undefined) merged.status = patch.status;
          if (patch.assetUrl !== undefined) merged.asset_url = patch.assetUrl;
          if (patch.channelAssets !== undefined) {
            const current = ((
              merged as unknown as { channel_assets?: Record<string, string | null> }
            ).channel_assets ?? {}) as Record<string, string>;
            const next: Record<string, string> = { ...current };
            for (const [k, v] of Object.entries(patch.channelAssets)) {
              if (v === null) delete next[k];
              else next[k] = v;
            }
            (merged as unknown as { channel_assets: Record<string, string> }).channel_assets = next;
          }
          if (patch.content !== undefined) merged.content = patch.content;

          return merged;
        });
        return { ...prev, pieces: nextPieces };
      });
    },
    [qc, gridKey],
  );

  const updateMut = useMutation({
    mutationFn: updateFn,
    onError: (e: Error) => toast.error(e.message),
  });

  const onPatch = useCallback(
    (id: string, patch: PiecePatch) => {
      applyLocalPatch(id, patch);
      updateMut.mutate({ data: { pieceId: id, ...patch } });
    },
    [applyLocalPatch, updateMut],
  );

  const deleteMut = useMutation({
    mutationFn: deleteFn,
    onError: (e: Error) => toast.error(e.message),
  });

  const onDelete = useCallback(
    (id: string) => {
      const prev = qc.getQueryData<GridData>(gridKey);
      const piece = prev?.pieces.find((p) => p.id === id);
      const hadHs =
        piece &&
        Object.keys((piece.hubspot_broadcast_ids ?? {}) as Record<string, string>).length > 0;
      qc.setQueryData<GridData>(gridKey, (curr) =>
        curr ? { ...curr, pieces: curr.pieces.filter((p) => p.id !== id) } : curr,
      );
      const finalize = () =>
        deleteMut.mutate(
          { data: { pieceId: id } },
          {
            onError: () => {
              if (prev) qc.setQueryData(gridKey, prev);
            },
          },
        );
      if (hadHs) {
        unsyncFn({ data: { pieceId: id } }).finally(finalize);
      } else {
        finalize();
      }
    },
    [qc, gridKey, deleteMut, unsyncFn],
  );

  const onSyncHubspot = useCallback(
    (id: string) => {
      setSyncingId(id);
      syncFn({ data: { pieceId: id } })
        .then((r) => {
          toast.success(
            r.errors?.length
              ? `Sincronizado con avisos: ${r.errors.join(" | ")}`
              : "Programado en HubSpot",
          );
          invalidate();
        })
        .catch((e: Error) => toast.error(e.message))
        .finally(() => setSyncingId(null));
    },
    [syncFn, invalidate],
  );

  const onSyncMonth = useCallback(() => {
    if (!wsQ.data) return;
    toast.promise(
      syncMonthFn({ data: { workspaceId: wsQ.data.id, year, month } }).then((r) => {
        invalidate();
        return r;
      }),
      {
        loading: "Sincronizando piezas programadas…",
        success: (r) =>
          `HubSpot: ${r.ok}/${r.total} sincronizadas${r.failed ? `, ${r.failed} con error` : ""}`,
        error: (e: Error) => e.message,
      },
    );
  }, [syncMonthFn, wsQ.data, year, month, invalidate]);

  const createMut = useMutation({
    mutationFn: createFn,
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  const pieces = gridQ.data?.pieces ?? [];
  const copiesByPiece: CopiesByPiece = useMemo(() => {
    const m: CopiesByPiece = new Map();
    (gridQ.data?.copies ?? []).forEach((c) => {
      if (!m.has(c.piece_id)) m.set(c.piece_id, {});
      m.get(c.piece_id)![c.channel] = { body: c.body ?? "", hashtags: c.hashtags ?? [] };
    });
    return m;
  }, [gridQ.data?.copies]);

  const monthChannels = useMemo(() => {
    const s = new Set<string>();
    pieces.forEach((p) => (p.channels ?? []).forEach((c) => s.add(c)));
    return PIECE_CHANNELS.filter((c) => s.has(c));
  }, [pieces]);

  const createBlankPiece = () => {
    const iso = new Date(year, month - 1, 1, 9, 0).toISOString();
    createMut.mutate({
      data: { workspaceId: wsQ.data!.id, publishAt: iso, format: "post", channels: ["instagram"] },
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ============ Banner ============ */}
      <div className="px-6 pt-5">
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5 flex items-center justify-between shadow-sm"
          style={{ background: "var(--gradient-grilla-banner)" }}
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.25), transparent 55%)",
            }}
          />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/70">
              Plan RRSS
            </div>
            <h1 className="text-white font-bold text-2xl leading-tight mt-0.5">
              {MONTH_NAMES[month - 1]} {year}
            </h1>
            {monthChannels.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {monthChannels.map((c) => {
                  const meta = CHANNEL_META[c];
                  const Icon = meta.icon;
                  return (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 text-[11px] text-white/90 bg-white/10 backdrop-blur-sm rounded-full pl-1.5 pr-2 py-0.5"
                    >
                      <Icon className="w-3 h-3" />
                      {CHANNEL_LABEL[c]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="relative flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 mr-2 bg-white/10 backdrop-blur-sm rounded-lg p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
                onClick={prevMonth}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <button
                className="text-white text-xs font-medium px-2"
                onClick={() => {
                  const n = new Date();
                  setYear(n.getFullYear());
                  setMonth(n.getMonth() + 1);
                }}
              >
                Hoy
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white hover:bg-white/15 hover:text-white"
                onClick={nextMonth}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20"
              onClick={() => setShowHubspot(true)}
              title="Configurar canales de HubSpot"
            >
              <Link2 className="w-3.5 h-3.5 mr-1" /> HubSpot
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20"
              onClick={onSyncMonth}
              title="Sincronizar piezas programadas del mes con HubSpot"
            >
              <CloudUpload className="w-3.5 h-3.5 mr-1" /> Sync mes
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-white/95 hover:bg-white text-slate-900"
              onClick={() => setShowGenerate(true)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Generar mes
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-white text-slate-900 hover:bg-white/90 shadow"
              onClick={createBlankPiece}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Nueva pieza
            </Button>
          </div>
        </div>
      </div>

      {/* ============ Paper / Sheet ============ */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div
          className="rounded-xl border shadow-sm overflow-hidden"
          style={{ background: "var(--grilla-paper)", borderColor: "var(--border)" }}
        >
          {gridQ.isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : pieces.length === 0 ? (
            <EmptyGrilla
              month={month}
              year={year}
              onGenerate={() => setShowGenerate(true)}
              onCreate={createBlankPiece}
            />
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr
                  className="text-left"
                  style={{
                    background: "var(--grilla-header-strip)",
                    color: "var(--grilla-header-text)",
                  }}
                >
                  <th className="w-8"></th>
                  <Th>Temática</Th>
                  <Th>Título post</Th>
                  <Th>Fecha publicación</Th>
                  <Th>Tipo</Th>
                  <Th>Canales</Th>
                  <Th>Contenido</Th>
                  <Th>Estado</Th>
                  <Th className="text-center">Archivo</Th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((p, i) => {
                  const pillar = p.pillar_id ? (pillarMap.get(p.pillar_id) ?? null) : null;
                  const isOpen = openRowId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <GrillaRow
                        piece={p}
                        index={i}
                        workspaceId={wsQ.data!.id}
                        pillar={pillar}
                        allPillars={pillars}
                        isOpen={isOpen}
                        onToggle={toggleExpanded}
                        onPatch={onPatch}
                        onDelete={onDelete}
                        onSyncHubspot={onSyncHubspot}
                        isSyncing={syncingId === p.id}
                      />
                      {isOpen && (
                        <tr style={{ background: "var(--grilla-paper-alt)" }}>
                          <td
                            colSpan={10}
                            className="px-6 py-4"
                            style={{
                              borderLeft: `3px solid ${pillar?.color ?? "transparent"}`,
                              borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <CopiesInline
                              pieceId={p.id}
                              channels={p.channels ?? []}
                              copies={copiesByPiece.get(p.id) ?? {}}
                              onSaved={invalidate}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showGenerate && wsQ.data && (
        <GenerateDialog
          workspaceId={wsQ.data.id}
          year={year}
          month={month}
          templates={tplsQ.data ?? []}
          onClose={() => setShowGenerate(false)}
          onDone={invalidate}
        />
      )}
      {showHubspot && wsQ.data && (
        <HubspotConfigDialog workspaceId={wsQ.data.id} onClose={() => setShowHubspot(false)} />
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 font-bold text-[10px] uppercase tracking-[0.12em] ${className}`}>
      {children}
    </th>
  );
}
