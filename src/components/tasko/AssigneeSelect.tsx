import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { MemberAvatar } from "./MemberAvatar";
import { UserPlus, X } from "lucide-react";

type Member = {
  user_id: string;
  profile: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
};

export function AssigneeSelect({
  members,
  value,
  onChange,
  compact = true,
}: {
  members: Member[];
  value: string | null;
  onChange: (v: string | null) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = members.find((m) => m.user_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded hover:bg-accent/50 ${
            compact ? "p-0.5" : "px-2 py-1 text-sm"
          }`}
        >
          {current ? (
            <MemberAvatar profile={current.profile} size={compact ? 26 : 28} />
          ) : (
            <div
              className={`rounded border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground ${
                compact ? "w-[26px] h-[26px]" : "w-7 h-7"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="text-[13px] leading-5 truncate max-w-[10rem]">
            {current?.profile?.full_name ?? current?.profile?.email ?? (
              <span className="text-muted-foreground">Sin asignar</span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar miembro..." />
          <CommandList>
            <CommandEmpty>Sin miembros</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-2" />
                  Quitar asignación
                </CommandItem>
              )}
              {members.map((m) => (
                <CommandItem
                  key={m.user_id}
                  value={`${m.profile?.full_name ?? ""} ${m.profile?.email ?? ""}`}
                  onSelect={() => {
                    onChange(m.user_id);
                    setOpen(false);
                  }}
                >
                  <MemberAvatar profile={m.profile} size={20} className="mr-2" />
                  <span className="truncate">
                    {m.profile?.full_name ?? m.profile?.email ?? "Miembro"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
