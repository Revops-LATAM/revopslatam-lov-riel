import { Briefcase, Shield } from "lucide-react";
import type { Space } from "@/lib/active-space";

export function SpaceSwitcher({ space, setSpace }: { space: Space; setSpace: (s: Space) => void }) {
  const items: { id: Space; label: string; icon: React.ReactNode }[] = [
    { id: "work", label: "Trabajo", icon: <Briefcase className="w-3.5 h-3.5" /> },
    { id: "admin", label: "Administración", icon: <Shield className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="px-2 pt-2">
      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-sidebar-accent/40 border border-sidebar-border/50">
        {items.map((it) => {
          const active = space === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setSpace(it.id)}
              className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
