import { useEffect, useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  CHANNEL_LABEL,
  CHANNEL_META,
  FORMAT_LABEL,
  FORMAT_META,
  MONTH_NAMES,
  STATUS_LABEL,
  STATUS_META,
  type PieceChannel,
  type PieceFormat,
  type PieceStatus,
  type PillarLite,
} from "./constants";
import { PIECE_CHANNELS, PIECE_FORMATS, PIECE_STATUSES } from "@/lib/api/grilla.functions";

export function PillarChip({
  pillar,
  allPillars,
  onChange,
}: {
  pillar: { label: string; color: string | null } | null;
  allPillars: PillarLite[];
  onChange: (id: string | null) => void;
}) {
  const color = pillar?.color ?? "#94a3b8";
  return (
    <Select
      value={allPillars.find((p) => p.label === pillar?.label)?.id ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger className="h-7 border-0 bg-transparent hover:bg-foreground/[0.05] shadow-none px-1.5 gap-1.5 w-full">
        {pillar ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium truncate max-w-[10rem]"
            style={{
              background: `color-mix(in oklab, ${color} 14%, transparent)`,
              color: `color-mix(in oklab, ${color} 65%, black)`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
            {pillar.label}
          </span>
        ) : (
          <span className="text-muted-foreground text-[11px]">—</span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Sin temática</SelectItem>
        {allPillars.map((pl) => (
          <SelectItem key={pl.id} value={pl.id}>
            <span className="inline-flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: pl.color ?? "#94a3b8" }}
              />
              {pl.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateCell({
  iso,
  onChange,
}: {
  iso: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const d = iso ? new Date(iso) : null;
  const label = d
    ? `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
    : "Elegir fecha";
  const timeLabel = d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

  const timeValue = d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "09:00";

  const applyDate = (date: Date | undefined) => {
    if (!date) {
      onChange(null);
      return;
    }
    const base = d ? new Date(d) : new Date();
    const next = new Date(date);
    next.setHours(base.getHours() || 9, base.getMinutes() || 0, 0, 0);
    onChange(next.toISOString());
  };

  const applyTime = (val: string) => {
    const [hh, mm] = val.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const next = d ? new Date(d) : new Date();
    next.setHours(hh, mm, 0, 0);
    onChange(next.toISOString());
  };

  const quickPick = (kind: "today" | "tomorrow" | "nextWeek") => {
    const base = new Date();
    if (kind === "tomorrow") base.setDate(base.getDate() + 1);
    if (kind === "nextWeek") base.setDate(base.getDate() + 7);
    const [hh, mm] = timeValue.split(":").map((n) => parseInt(n, 10));
    base.setHours(hh || 9, mm || 0, 0, 0);
    onChange(base.toISOString());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 text-left rounded-md px-1.5 py-1 hover:bg-foreground/[0.05] transition-colors w-full min-w-0",
            !d && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="w-3 h-3 shrink-0 opacity-60" />
          <div className="leading-tight min-w-0">
            <div className="text-[12px] font-medium truncate">{label}</div>
            {timeLabel && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {timeLabel}
              </div>
            )}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <div className="flex flex-col">
          <div className="flex items-center gap-1 p-2 border-b">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => quickPick("today")}
            >
              Hoy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => quickPick("tomorrow")}
            >
              Mañana
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => quickPick("nextWeek")}
            >
              +1 semana
            </Button>
          </div>
          <Calendar
            mode="single"
            selected={d ?? undefined}
            onSelect={applyDate}
            initialFocus
            weekStartsOn={1}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex items-center justify-between gap-2 p-2 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Hora
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={timeValue}
                onChange={(e) => applyTime(e.target.value)}
                className="h-8 text-xs w-[7rem]"
              />
              {d && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Limpiar
                </Button>
              )}
              <Button size="sm" className="h-8 text-[11px]" onClick={() => setOpen(false)}>
                Listo
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FormatPill({
  format,
  onChange,
}: {
  format: PieceFormat;
  onChange: (v: PieceFormat) => void;
}) {
  const meta = FORMAT_META[format];
  const Icon = meta.icon;
  return (
    <Select value={format} onValueChange={(v) => onChange(v as PieceFormat)}>
      <SelectTrigger
        className="h-7 w-fit max-w-full border-0 shadow-none rounded-md px-2 py-1 gap-1.5 text-[11px] font-semibold justify-start [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>svg]:hidden"
        style={{ background: meta.soft, color: meta.color }}
      >
        <Icon className="w-3 h-3 shrink-0" />
        {FORMAT_LABEL[format]}
      </SelectTrigger>
      <SelectContent>
        {PIECE_FORMATS.map((f) => {
          const m = FORMAT_META[f];
          const I = m.icon;
          return (
            <SelectItem key={f} value={f}>
              <span className="inline-flex items-center gap-2">
                <I className="w-3.5 h-3.5" style={{ color: m.color }} />
                {FORMAT_LABEL[f]}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function StatusPill({
  status,
  onChange,
}: {
  status: PieceStatus;
  onChange: (v: PieceStatus) => void;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Select value={status} onValueChange={(v) => onChange(v as PieceStatus)}>
      <SelectTrigger
        className="h-7 w-fit max-w-full border-0 shadow-none rounded-md px-2 py-1 gap-1.5 text-[11px] font-semibold justify-start [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>svg]:hidden"
        style={{
          background: meta.soft,
          color: meta.color,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 30%, transparent)`,
        }}
      >
        <Icon className="w-3 h-3 shrink-0" />
        {STATUS_LABEL[status]}
      </SelectTrigger>
      <SelectContent>
        {PIECE_STATUSES.map((s) => {
          const m = STATUS_META[s];
          const I = m.icon;
          return (
            <SelectItem key={s} value={s}>
              <span className="inline-flex items-center gap-2">
                <I className="w-3.5 h-3.5" style={{ color: m.color }} />
                {STATUS_LABEL[s]}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function ChannelPicker({
  channels,
  onChange,
}: {
  channels: string[];
  onChange: (next: PieceChannel[]) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PIECE_CHANNELS.map((ch) => {
        const on = channels.includes(ch);
        const meta = CHANNEL_META[ch];
        const Icon = meta.icon;
        return (
          <button
            key={ch}
            onClick={() => {
              const next = on
                ? (channels.filter((c) => c !== ch) as PieceChannel[])
                : ([...channels, ch] as PieceChannel[]);
              onChange(next);
            }}
            title={CHANNEL_LABEL[ch]}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-all"
            style={
              on
                ? {
                    background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
                    color: meta.color,
                  }
                : { background: "transparent", color: "var(--muted-foreground)", opacity: 0.35 }
            }
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function InlineText({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setV(value);
          e.currentTarget.blur();
        }
      }}
      className="h-7 text-[12px] w-full border-0 bg-transparent hover:bg-foreground/[0.05] focus-visible:bg-background focus-visible:ring-1 px-1.5 font-medium"
    />
  );
}

export function InlineTextarea({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Textarea
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onCommit(v);
      }}
      rows={2}
      className="min-h-[44px] text-[12px] w-full max-w-[20rem] resize-y border-0 bg-transparent hover:bg-foreground/[0.05] focus-visible:bg-background focus-visible:ring-1 px-1.5 py-1 leading-snug shadow-none"
    />
  );
}
