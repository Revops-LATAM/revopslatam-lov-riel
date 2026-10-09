import { memo, useCallback } from "react";
import { ChevronDown, Trash2, CloudUpload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  PillarChip,
  InlineText,
  DateCell,
  FormatPill,
  ChannelPicker,
  InlineTextarea,
  StatusPill,
} from "./cells";
import { AssetCell } from "./AssetCell";
import type {
  PieceChannel,
  PieceFormat,
  PieceRow,
  PieceStatus,
  PiecePatch,
  PillarLite,
} from "./constants";

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`px-3 py-2 align-top ${className}`}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {children}
    </td>
  );
}

export type GrillaRowProps = {
  piece: PieceRow;
  index: number;
  workspaceId: string;
  pillar: { label: string; color: string | null } | null;
  allPillars: PillarLite[];
  isOpen: boolean;
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: PiecePatch) => void;
  onDelete: (id: string) => void;
  onSyncHubspot: (id: string) => void;
  isSyncing?: boolean;
};

function GrillaRowInner({
  piece: p,
  index,
  workspaceId,
  pillar,
  allPillars,
  isOpen,
  onToggle,
  onPatch,
  onDelete,
  onSyncHubspot,
  isSyncing,
}: GrillaRowProps) {
  const hsIds = (p.hubspot_broadcast_ids ?? {}) as Record<string, string>;
  const hsSynced = Object.keys(hsIds).length > 0;
  const hsError = p.hubspot_last_error;
  const rowBg = index % 2 === 0 ? "var(--grilla-paper)" : "var(--grilla-paper-alt)";
  const stripe = pillar?.color ?? "transparent";

  const patchPillar = useCallback((v: string | null) => onPatch(p.id, { pillarId: v }), [p.id, onPatch]);
  const patchTitle = useCallback((v: string) => onPatch(p.id, { title: v }), [p.id, onPatch]);
  const patchDate = useCallback((v: string | null) => onPatch(p.id, { publishAt: v }), [p.id, onPatch]);
  const patchFormat = useCallback((v: PieceFormat) => onPatch(p.id, { format: v }), [p.id, onPatch]);
  const patchChannels = useCallback((v: PieceChannel[]) => onPatch(p.id, { channels: v }), [p.id, onPatch]);
  const patchContent = useCallback((v: string) => onPatch(p.id, { content: v }), [p.id, onPatch]);
  const patchStatus = useCallback((v: PieceStatus) => onPatch(p.id, { status: v }), [p.id, onPatch]);
  const patchAsset = useCallback((v: string | null) => onPatch(p.id, { assetUrl: v }), [p.id, onPatch]);
  const patchChannelAsset = useCallback(
    (channel: string, v: string | null) =>
      onPatch(p.id, { channelAssets: { [channel]: v } }),
    [p.id, onPatch],
  );
  const channelAssets =
    ((p as unknown as { channel_assets?: Record<string, string | null> }).channel_assets ??
      {}) as Record<string, string | null>;


  return (
    <tr
      className="group align-top transition-colors"
      style={{ background: rowBg, borderLeft: `3px solid ${stripe}` }}
    >
      <td
        className="py-2 pl-2 align-middle"
        style={{
          borderLeft: `3px solid ${stripe}`,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={() => onToggle(p.id)}
          className="text-muted-foreground/60 hover:text-foreground"
          title="Ver copies"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        </button>
      </td>
      <Td><PillarChip pillar={pillar ?? null} allPillars={allPillars} onChange={patchPillar} /></Td>
      <Td><InlineText value={p.title ?? ""} placeholder="Título de la pieza…" onCommit={patchTitle} /></Td>
      <Td><DateCell iso={p.publish_at ?? null} onChange={patchDate} /></Td>
      <Td><FormatPill format={p.format as PieceFormat} onChange={patchFormat} /></Td>
      <Td><ChannelPicker channels={p.channels ?? []} onChange={patchChannels} /></Td>
      <Td><InlineTextarea value={p.content ?? ""} placeholder="Describí el contenido…" onCommit={patchContent} /></Td>
      <Td><StatusPill status={p.status as PieceStatus} onChange={patchStatus} /></Td>
      <Td className="text-center">
        <AssetCell
          pieceId={p.id}
          workspaceId={workspaceId}
          channels={p.channels ?? []}
          channelAssets={channelAssets}
          fallbackUrl={p.asset_url ?? null}
          onChannelChange={patchChannelAsset}
          onFallbackChange={patchAsset}
        />
      </Td>

      <Td>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="text-muted-foreground/60 hover:text-primary disabled:opacity-40"
            title={
              hsError
                ? `Error HubSpot: ${hsError}`
                : hsSynced
                  ? "Actualizar en HubSpot"
                  : "Programar en HubSpot"
            }
            disabled={isSyncing}
            onClick={() => onSyncHubspot(p.id)}
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : hsError ? (
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            ) : hsSynced ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            className="text-muted-foreground/60 hover:text-destructive"
            onClick={() => {
              if (confirm("¿Eliminar esta pieza?")) onDelete(p.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </Td>
    </tr>
  );
}

export const GrillaRow = memo(GrillaRowInner);
