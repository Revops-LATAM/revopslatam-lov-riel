import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MemberAvatar } from "./MemberAvatar";
import { UserPlus, Check, X } from "lucide-react";

type Member = {
  user_id: string;
  profile: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export function MultiAssigneeSelect({
  members,
  value,
  onChange,
  maxAvatars = 3,
}: {
  members: Member[];
  value: string[];
  onChange: (userIds: string[]) => void;
  maxAvatars?: number;
}) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState<string[]>(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value.join("|")]);

  const selected = members.filter((m) => localValue.includes(m.user_id));
  const extra = selected.length - maxAvatars;

  const toggle = (userId: string) => {
    const next = localValue.includes(userId)
      ? localValue.filter((v) => v !== userId)
      : [...localValue, userId];
    setLocalValue(next);
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded hover:bg-accent/50 px-2 py-1 text-sm min-h-8"
        >
          {selected.length === 0 ? (
            <>
              <div className="rounded border border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground w-7 h-7">
                <UserPlus className="w-3.5 h-3.5" />
              </div>
              <span className="text-muted-foreground text-[13px]">Sin asignar</span>
            </>
          ) : (
            <>
              <div className="flex items-center -space-x-2">
                {selected.slice(0, maxAvatars).map((m) => (
                  <MemberAvatar
                    key={m.user_id}
                    profile={m.profile}
                    size={26}
                    className="ring-2 ring-background"
                  />
                ))}
                {extra > 0 && (
                  <div className="w-[26px] h-[26px] rounded-full bg-muted text-[11px] font-semibold flex items-center justify-center ring-2 ring-background text-muted-foreground">
                    +{extra}
                  </div>
                )}
              </div>
              {selected.length === 1 && (
                <span className="text-[13px] leading-5 truncate max-w-[10rem]">
                  {selected[0].profile?.full_name ?? selected[0].profile?.email ?? "Miembro"}
                </span>
              )}
              {selected.length > 1 && (
                <span className="text-[12px] leading-5 text-muted-foreground">
                  {selected.length} asignados
                </span>
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar miembro..." />
          <CommandList>
            <CommandEmpty>Sin miembros</CommandEmpty>
            {localValue.length > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setLocalValue([]);
                    onChange([]);
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-2" />
                  Quitar todos
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {members.map((m) => {
                const isSel = localValue.includes(m.user_id);
                return (
                  <CommandItem
                    key={m.user_id}
                    value={`${m.profile?.full_name ?? ""} ${m.profile?.email ?? ""}`}
                    onSelect={() => toggle(m.user_id)}
                  >
                    <MemberAvatar profile={m.profile} size={20} className="mr-2" />
                    <span className="truncate flex-1">
                      {m.profile?.full_name ?? m.profile?.email ?? "Miembro"}
                    </span>
                    {isSel && <Check className="w-4 h-4 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
