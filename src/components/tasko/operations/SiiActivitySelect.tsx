import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import activities from "@/lib/sii-activities.json";
import { cn } from "@/lib/utils";

type Activity = { code: string; name: string; category: string };
const ALL = activities as Activity[];

export function SiiActivitySelect({
  value,
  onChange,
  placeholder = "Seleccionar actividad económica...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => {
    if (!value) return null;
    const m = value.match(/^(\d+)\s*[-—]\s*(.+)$/);
    const code = m ? m[1] : value;
    return ALL.find((a) => a.code === code) ?? null;
  }, [value]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = !term
      ? ALL
      : ALL.filter(
          (a) =>
            a.code.toLowerCase().includes(term) ||
            a.name.toLowerCase().includes(term) ||
            a.category.toLowerCase().includes(term),
        );
    const groups = new Map<string, Activity[]>();
    for (const a of list.slice(0, 300)) {
      if (!groups.has(a.category)) groups.set(a.category, []);
      groups.get(a.category)!.push(a);
    }
    return Array.from(groups.entries());
  }, [q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? `${selected.code} — ${selected.name}` : placeholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-h-[60vh] overflow-hidden flex flex-col"
        align="start"
      >
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código o descripción..."
              className="pl-7 h-8"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Sin resultados.</div>
          ) : (
            filtered.map(([cat, items]) => (
              <div key={cat} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {cat}
                </div>
                {items.map((a) => {
                  const isSel = selected?.code === a.code;
                  return (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => {
                        onChange(`${a.code} — ${a.name}`);
                        setOpen(false);
                        setQ("");
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 hover:bg-accent flex items-start gap-2",
                        isSel && "bg-accent",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-muted-foreground font-mono">{a.code}</div>
                        <div className="text-xs truncate">{a.name}</div>
                      </div>
                      {isSel && <Check className="w-3.5 h-3.5 text-primary mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
