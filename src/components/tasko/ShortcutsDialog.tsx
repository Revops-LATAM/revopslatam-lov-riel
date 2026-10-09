import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<{ group: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    group: "General",
    items: [
      { keys: ["⌘", "K"], label: "Abrir buscador" },
      { keys: ["?"], label: "Mostrar atajos" },
      { keys: ["Esc"], label: "Cerrar diálogo o panel" },
    ],
  },
  {
    group: "Navegación",
    items: [
      { keys: ["g", "h"], label: "Ir a Inicio" },
      { keys: ["g", "m"], label: "Ir a Mis tareas" },
      { keys: ["g", "p"], label: "Ir a Proyectos" },
      { keys: ["g", "t"], label: "Ir a Miembros" },
    ],
  },
  {
    group: "Tareas",
    items: [{ keys: ["c"], label: "Nueva tarea (en proyecto)" }],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Navega más rápido sin tocar el mouse.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SHORTCUTS.map((g) => (
            <div key={g.group}>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {g.group}
              </div>
              <div className="space-y-1.5">
                {g.items.map((it) => (
                  <div key={it.label} className="flex items-center justify-between text-sm py-1">
                    <span className="text-foreground">{it.label}</span>
                    <div className="flex gap-1">
                      {it.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="text-[11px] font-mono bg-muted border border-border rounded px-1.5 py-0.5 min-w-[22px] text-center"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
