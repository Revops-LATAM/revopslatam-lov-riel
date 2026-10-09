import { useRef, useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

export function QuickAdd({
  onAdd,
  placeholder = "Añadir tarea...",
}: {
  onAdd: (title: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const v = value.trim();
    if (v) {
      onAdd(v);
      setValue("");
      // keep input open so user can rapid-fire add
      inputRef.current?.focus();
    } else {
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="w-3.5 h-3.5" />
        Añadir tarea
      </button>
    );
  }

  return (
    <div className="bg-card border border-primary/40 rounded-md p-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        placeholder={placeholder}
        className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent"
      />
      <div className="text-[10px] text-muted-foreground mt-1 px-1">
        Enter para añadir · Esc para cerrar
      </div>
    </div>
  );
}
