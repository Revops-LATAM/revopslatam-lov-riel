import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type StColor =
  | "gray" | "stone" | "blue" | "purple"
  | "magenta" | "amber" | "orange" | "red" | "teal";

export type StatusOption = { value: string; label: string; color?: StColor; hex?: string | null };

const STATUS_COLOR: Record<string, StColor> = {
  nueva: "gray", backlog: "gray",
  planificada: "blue", todo: "blue",
  en_curso: "amber", in_progress: "amber",
  en_pausa: "stone",
  revision_interna: "purple", in_review: "purple",
  revision_cliente: "magenta",
  en_correccion: "orange",
  demorada: "red",
  completada: "teal", done: "teal",
  cancelada: "gray", cancelled: "gray",
  por_planificar: "gray", sin_iniciar: "gray",
  planificado: "blue",
  cerrado: "stone",
  borrador: "gray", por_emitir: "gray",
  activo: "teal",
  en_renovacion: "amber",
  finalizado: "stone",
  cancelado: "red", anulado: "red",
  emitida: "teal", emitted: "teal",
  pagada: "teal",
  vencida: "red",
  por_facturar: "amber",
};

export function mapCategoryToStColor(category?: string | null): StColor {
  switch (category) {
    case "abierta": return "blue";
    case "en_progreso": return "amber";
    case "bloqueada": return "red";
    case "completada": return "teal";
    case "cancelada": return "gray";
    default: return "gray";
  }
}

export function statusColorFor(value: string): StColor {
  return STATUS_COLOR[value] ?? "gray";
}

/** Produce foreground text color with reasonable contrast on a soft tinted bg. */
function darken(hex: string, amount = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

export function pillStyle(c: StColor, hex?: string | null): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 6,
    height: 24,
    fontSize: 13,
    lineHeight: "20px",
    paddingLeft: 10,
    paddingRight: 8,
    display: "inline-flex",
    alignItems: "center",
    fontWeight: 500,
  };
  if (hex && /^#?[0-9a-f]{6}$/i.test(hex.trim())) {
    const h = hex.startsWith("#") ? hex : `#${hex}`;
    return {
      ...base,
      backgroundColor: `${h}1f`,
      color: darken(h, 0.35),
      borderLeft: `3px solid ${h}`,
    };
  }
  return {
    ...base,
    backgroundColor: `var(--st-${c}-soft)`,
    color: `var(--st-${c}-text)`,
    borderLeft: `3px solid var(--st-${c})`,
  };
}

export function StatusBadgeSelect({
  value,
  options,
  onChange,
  disabled,
  readOnly,
  className,
  color,
  hex,
}: {
  value: string;
  options: readonly StatusOption[];
  onChange?: (v: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  color?: StColor;
  /** Override with a raw hex from DB (dynamic per-workspace statuses). */
  hex?: string | null;
}) {
  const opt = options.find((o) => o.value === value);
  const c: StColor = color ?? opt?.color ?? statusColorFor(value);
  const h = hex ?? opt?.hex ?? null;
  const label = opt?.label ?? value;

  if (readOnly || !onChange) {
    return (
      <span style={pillStyle(c, h)} className={className}>
        {label}
      </span>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        style={pillStyle(c, h)}
        className={`w-auto gap-1.5 border-0 focus:ring-0 focus:ring-offset-0 [&>svg]:opacity-60 ${className ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => {
          const sc: StColor = s.color ?? statusColorFor(s.value);
          const sh = s.hex ?? null;
          const swatch = sh && /^#?[0-9a-f]{6}$/i.test(sh.trim())
            ? (sh.startsWith("#") ? sh : `#${sh}`)
            : `var(--st-${sc})`;
          return (
            <SelectItem key={s.value} value={s.value} className="text-[13px]">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  style={{
                    width: 3,
                    height: 14,
                    borderRadius: 2,
                    backgroundColor: swatch,
                  }}
                />
                {s.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

