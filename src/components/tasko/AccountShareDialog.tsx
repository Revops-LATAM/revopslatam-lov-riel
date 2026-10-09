import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Trash2, Users, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { membersQO } from "@/lib/api/tasko.queries";
import {
  getAccountAccess,
  grantAccountAccess,
  revokeAccountAccess,
  setAccountAccessMode,
} from "@/lib/api/account-access.functions";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: string;
  workspaceId: string;
};

export function AccountShareDialog({ open, onOpenChange, accountId, workspaceId }: Props) {
  const qc = useQueryClient();
  const getFn = useServerFn(getAccountAccess);
  const grantFn = useServerFn(grantAccountAccess);
  const revokeFn = useServerFn(revokeAccountAccess);
  const setModeFn = useServerFn(setAccountAccessMode);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const accessQ = useQuery({
    queryKey: ["account-access", accountId],
    queryFn: () => getFn({ data: { accountId } }),
    enabled: open,
  });

  const membersQ = useQuery({ ...membersQO(workspaceId), enabled: open });

  const restricted = accessQ.data?.account.access_mode === "restricted";
  const granted = accessQ.data?.members ?? [];
  const grantedIds = new Set(granted.map((m) => m.user_id));

  const availableMembers = useMemo(() => {
    const all = membersQ.data ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter((m) => !grantedIds.has(m.user_id))
      .filter((m) => {
        if (!q) return true;
        const p = m.profile;
        return (
          (p?.full_name ?? "").toLowerCase().includes(q) ||
          (p?.email ?? "").toLowerCase().includes(q)
        );
      });
  }, [membersQ.data, grantedIds, search]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["account-access", accountId] });
    qc.invalidateQueries({ queryKey: ["operations-tree", workspaceId] });
    qc.invalidateQueries({ queryKey: ["accounts", workspaceId] });
  };

  const handleToggleMode = async (checked: boolean) => {
    try {
      await setModeFn({ data: { accountId, mode: checked ? "restricted" : "open" } });
      toast.success(checked ? "Cliente marcado como privado" : "Cliente marcado como abierto");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  const handleGrant = async (userId: string) => {
    try {
      await grantFn({ data: { accountId, userIds: [userId] } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar");
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await revokeFn({ data: { accountId, userId } });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Compartir acceso · {accessQ.data?.account.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            Controla quién puede ver este cliente y todos sus contratos, proyectos y tareas.
            Los administradores del workspace siempre tienen acceso.
          </DialogDescription>
        </DialogHeader>

        {/* Access mode toggle */}
        <div className="flex items-start justify-between gap-4 p-3 border rounded-md bg-muted/30">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              {restricted ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              {restricted ? "Privado" : "Abierto"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {restricted
                ? "Solo administradores y las personas listadas abajo pueden verlo."
                : "Todos los miembros del workspace pueden ver este cliente."}
            </p>
          </div>
          <Switch
            checked={restricted}
            onCheckedChange={handleToggleMode}
            aria-label="Modo privado"
          />
        </div>

        {/* Add member */}
        <div>
          <Label className="text-xs text-muted-foreground">Personas con acceso</Label>
          <div className="mt-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                  + Agregar persona
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="p-2 border-b">
                  <Input
                    placeholder="Buscar por nombre o email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                <ScrollArea className="h-64">
                  {availableMembers.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      Sin resultados
                    </div>
                  ) : (
                    availableMembers.map((m) => (
                      <button
                        key={m.user_id}
                        onClick={() => {
                          handleGrant(m.user_id);
                          setSearch("");
                        }}
                        className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 text-left"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(m.profile?.full_name ?? m.profile?.email ?? "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {m.profile?.full_name ?? m.profile?.email ?? "Usuario"}
                          </div>
                          {m.profile?.email && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {m.profile.email}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Granted members list */}
        <ScrollArea className="max-h-72 border rounded-md">
          {granted.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {restricted
                ? "Nadie con acceso todavía. Agrega personas arriba."
                : "El cliente es abierto — todo el workspace lo ve."}
            </div>
          ) : (
            <div className="divide-y">
              {granted.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 p-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(m.profile?.full_name ?? m.profile?.email ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {m.profile?.full_name ?? m.profile?.email ?? "Usuario"}
                    </div>
                    {m.profile?.email && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {m.profile.email}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(m.user_id)}
                    title="Quitar acceso"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
            <Check className="h-3.5 w-3.5 mr-1" /> Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
