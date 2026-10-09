import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink,
  FileEdit,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_LABEL, CHANNEL_META, type PieceChannel } from "./constants";

export function AssetCell({
  pieceId,
  workspaceId,
  channels,
  channelAssets,
  fallbackUrl,
  onChannelChange,
  onFallbackChange,
}: {
  pieceId: string;
  workspaceId: string;
  channels: string[];
  channelAssets: Record<string, string | null>;
  fallbackUrl: string | null;
  onChannelChange: (channel: string, next: string | null) => void;
  onFallbackChange: (next: string | null) => void;
}) {
  // If no channels selected yet, keep the single fallback uploader so the
  // "Archivo" column still works before the user picks channels.
  if (!channels || channels.length === 0) {
    return (
      <div className="flex justify-center">
        <SingleUploader
          pieceId={pieceId}
          workspaceId={workspaceId}
          slot="general"
          url={fallbackUrl}
          onChange={onFallbackChange}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {channels.map((ch) => {
        const meta = CHANNEL_META[ch as PieceChannel];
        const Icon = meta?.icon;
        const color = meta?.color ?? "#94a3b8";
        return (
          <div key={ch} className="flex items-center gap-1.5">
            <span
              title={CHANNEL_LABEL[ch as PieceChannel] ?? ch}
              className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{
                background: `color-mix(in oklab, ${color} 14%, transparent)`,
                color,
              }}
            >
              {Icon ? <Icon className="w-3 h-3" /> : null}
            </span>
            <SingleUploader
              pieceId={pieceId}
              workspaceId={workspaceId}
              slot={ch}
              url={channelAssets[ch] ?? null}
              onChange={(next) => onChannelChange(ch, next)}
            />
          </div>
        );
      })}
    </div>
  );
}

function SingleUploader({
  pieceId,
  workspaceId,
  slot,
  url,
  onChange,
}: {
  pieceId: string;
  workspaceId: string;
  slot: string;
  url: string | null;
  onChange: (next: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `asset-${pieceId}-${slot}`;
  const isExternal = !!url && /^https?:\/\//i.test(url);
  const isStoragePath = !!url && !isExternal;

  const handleFile = async (file: File) => {
    try {
      setUploading(true);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${workspaceId}/${pieceId}/${slot}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("marketing-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      onChange(path);
      toast.success("Archivo subido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo archivo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        id={inputId}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      {!url ? (
        <label
          htmlFor={inputId}
          className="w-8 h-8 rounded-md border border-dashed flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:border-solid transition-colors cursor-pointer"
          style={{ borderColor: "var(--border-strong)" }}
          title="Subir archivo"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
        </label>
      ) : isStoragePath ? (
        <StorageAssetThumb
          path={url}
          onReplace={() => document.getElementById(inputId)?.click()}
          onRemove={() => onChange(null)}
          uploading={uploading}
        />
      ) : (
        <ExternalAssetThumb
          url={url}
          onReplace={() => document.getElementById(inputId)?.click()}
          onRemove={() => onChange(null)}
          uploading={uploading}
        />
      )}
    </div>
  );
}

function StorageAssetThumb({
  path,
  onReplace,
  onRemove,
  uploading,
}: {
  path: string;
  onReplace: () => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  const signedQ = useQuery({
    queryKey: ["signed-asset", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("marketing-assets")
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 50 * 60 * 1000,
  });
  const url = signedQ.data;
  const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(path);
  return (
    <div className="flex items-center gap-1">
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="w-8 h-8 rounded-md border overflow-hidden bg-muted flex items-center justify-center relative group/thumb"
        style={{ borderColor: "var(--border)" }}
        title={path.split("/").pop()}
        onClick={(e) => { if (!url) e.preventDefault(); }}
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : isImage && url ? (
          <img src={url} alt="archivo" className="w-full h-full object-cover" />
        ) : (
          <FileEdit className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {url && (
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
            <ExternalLink className="w-3 h-3 text-white" />
          </span>
        )}
      </a>
      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onReplace} title="Reemplazar">
          <Pencil className="w-3 h-3" />
        </button>
        <button className="text-[10px] text-muted-foreground hover:text-destructive" onClick={onRemove} title="Quitar">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function ExternalAssetThumb({
  url,
  onReplace,
  onRemove,
  uploading,
}: {
  url: string;
  onReplace: () => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);
  return (
    <div className="flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-8 h-8 rounded-md border overflow-hidden bg-muted flex items-center justify-center relative group/thumb"
        style={{ borderColor: "var(--border)" }}
        title={url}
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : isImage ? (
          <img src={url} alt="archivo" className="w-full h-full object-cover" />
        ) : (
          <FileEdit className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
          <ExternalLink className="w-3 h-3 text-white" />
        </span>
      </a>
      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={onReplace} title="Reemplazar">
          <Pencil className="w-3 h-3" />
        </button>
        <button className="text-[10px] text-muted-foreground hover:text-destructive" onClick={onRemove} title="Quitar">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
