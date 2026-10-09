import {
  LayoutGrid,
  Play,
  FileText,
  BarChart3,
  MonitorPlay,
  Film,
  Instagram,
  Linkedin,
  Youtube,
  Music2,
  Lightbulb,
  PenLine,
  Palette,
  Clock,
  Send,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { PIECE_FORMATS, PIECE_STATUSES, PIECE_CHANNELS } from "@/lib/api/grilla.functions";
import type { Database } from "@/integrations/supabase/types";

export type PieceRow = Database["public"]["Tables"]["content_pieces_v2"]["Row"];
export type PieceFormat = (typeof PIECE_FORMATS)[number];
export type PieceStatus = (typeof PIECE_STATUSES)[number];
export type PieceChannel = (typeof PIECE_CHANNELS)[number];

export type CopiesByPiece = Map<string, Record<string, { body: string; hashtags: string[] }>>;

export type PillarLite = { id: string; label: string; color: string | null };

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  copy: "Copy",
  diseno: "Diseño",
  revision: "Revisión",
  programada: "Programada",
  publicada: "Publicada",
};

export const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

export const FORMAT_LABEL: Record<string, string> = {
  carrusel: "Carrusel",
  reel: "Reel",
  post: "Post",
  encuesta: "Encuesta",
  demo: "Demo",
  video: "Video",
};

type Meta = { icon: LucideIcon; color: string; soft: string };

export const FORMAT_META: Record<string, Meta> = {
  carrusel: { icon: LayoutGrid, color: "var(--fmt-carrusel)", soft: "var(--fmt-carrusel-soft)" },
  reel: { icon: Play, color: "var(--fmt-reel)", soft: "var(--fmt-reel-soft)" },
  post: { icon: FileText, color: "var(--fmt-post)", soft: "var(--fmt-post-soft)" },
  encuesta: { icon: BarChart3, color: "var(--fmt-encuesta)", soft: "var(--fmt-encuesta-soft)" },
  demo: { icon: MonitorPlay, color: "var(--fmt-demo)", soft: "var(--fmt-demo-soft)" },
  video: { icon: Film, color: "var(--fmt-video)", soft: "var(--fmt-video-soft)" },
};

export const STATUS_META: Record<string, Meta> = {
  idea: { icon: Lightbulb, color: "var(--pst-idea)", soft: "var(--pst-idea-soft)" },
  copy: { icon: PenLine, color: "var(--pst-copy)", soft: "var(--pst-copy-soft)" },
  diseno: { icon: Palette, color: "var(--pst-diseno)", soft: "var(--pst-diseno-soft)" },
  revision: { icon: Clock, color: "var(--pst-revision)", soft: "var(--pst-revision-soft)" },
  programada: { icon: Send, color: "var(--pst-programada)", soft: "var(--pst-programada-soft)" },
  publicada: {
    icon: CheckCircle2,
    color: "var(--pst-publicada)",
    soft: "var(--pst-publicada-soft)",
  },
};

export const CHANNEL_META: Record<string, { icon: LucideIcon; color: string }> = {
  instagram: { icon: Instagram, color: "#E1306C" },
  tiktok: { icon: Music2, color: "#111111" },
  linkedin: { icon: Linkedin, color: "#0A66C2" },
  youtube: { icon: Youtube, color: "#FF0000" },
};

export function toLocalDT(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type PiecePatch = Partial<{
  title: string;
  publishAt: string | null;
  format: PieceFormat;
  channels: PieceChannel[];
  pillarId: string | null;
  status: PieceStatus;
  assetUrl: string | null;
  channelAssets: Record<string, string | null>;
  content: string | null;
}>;
