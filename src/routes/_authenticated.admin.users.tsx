import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, grantAppRole, revokeAppRole } from "@/lib/api/admin.functions";
import { listWorkspaces } from "@/lib/api/workspaces.functions";
import {
  listWorkspaceMembers,
  listWorkspaceInvitations,
  inviteWorkspaceMember,
  updateMemberRole,
  removeMember,
  cancelInvitation,
  materializePendingInvitations,
} from "@/lib/api/members.functions";
import { listRoleTemplates, assignRoleTemplate } from "@/lib/api/permissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Usuarios y permisos · Riel" }] }),
  component: AdminUsers,
});

const ROLE_OPTIONS = [
  { value: "member", label: "Miembro" },
  { value: "admin", label: "Admin del espacio" },
  { value: "owner", label: "Owner" },
] as const;

function AdminUsers() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listAllUsers);
  const fetchWorkspaces = useServerFn(listWorkspaces);
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchInvites = useServerFn(listWorkspaceInvitations);
  const fetchTemplates = useServerFn(listRoleTemplates);

  const grant = useServerFn(grantAppRole);
  const revoke = useServerFn(revokeAppRole);
  const invite = useServerFn(inviteWorkspaceMember);
  const updRole = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);
  const cancel = useServerFn(cancelInvitation);
  const assignTpl = useServerFn(assignRoleTemplate);

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => fetchWorkspaces() });
  const primaryWs = useMemo(() => (workspaces.data ?? [])[0] ?? null, [workspaces.data]);
  const wsId = primaryWs?.id ?? "";

  const members = useQuery({
    queryKey: ["ws-members", wsId],
    queryFn: () => fetchMembers({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });
  const invites = useQuery({
    queryKey: ["ws-invitations", wsId],
    queryFn: () => fetchInvites({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });
  const templates = useQuery({
    queryKey: ["role-templates", wsId],
    queryFn: () => fetchTemplates({ data: { workspaceId: wsId } }),
    enabled: !!wsId,
  });

  const membersByUser = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of members.data ?? []) map.set(m.user_id, m);
    return map;
  }, [members.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["ws-members", wsId] });
    qc.invalidateQueries({ queryKey: ["ws-invitations", wsId] });
  };

  const inviteM = useMutation({
    mutationFn: (v: { email: string; role: any; roleTemplateId: string | null }) =>
      invite({
        data: {
          workspaceId: wsId,
          email: v.email,
          role: v.role,
          roleTemplateId: v.roleTemplateId,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(r?.added ? "Miembro agregado" : "Invitación enviada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<"member" | "admin" | "owner">("member");
  const [invTpl, setInvTpl] = useState<string>("");

  const roleM = useMutation({
    mutationFn: (v: { memberId: string; role: any }) =>
      updRole({ data: { memberId: v.memberId, role: v.role } }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tplM = useMutation({
    mutationFn: (v: { memberId: string; templateId: string | null }) =>
      assignTpl({ data: { workspaceId: wsId, memberId: v.memberId, templateId: v.templateId } }),
    onSuccess: () => {
      toast.success("Plantilla asignada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rmM = useMutation({
    mutationFn: (memberId: string) => remove({ data: { memberId } }),
    onSuccess: () => {
      toast.success("Miembro eliminado del espacio");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: (invitationId: string) => cancel({ data: { invitationId } }),
    onSuccess: () => {
      toast.success("Invitación cancelada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const materialize = useServerFn(materializePendingInvitations);
  const materializeM = useMutation({
    mutationFn: () => materialize({ data: { workspaceId: wsId } }),
    onSuccess: (res: any) => {
      toast.success(
        `Creados: ${res.created}, vinculados: ${res.linked}${res.errors?.length ? ` — errores: ${res.errors.length}` : ""}`,
      );
      if (res.errors?.length) console.warn("materialize errors", res.errors);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saToggle = useMutation({
    mutationFn: async (v: { userId: string; enable: boolean }) => {
      if (v.enable) return grant({ data: { userId: v.userId, role: "super_admin" } });
      return revoke({ data: { userId: v.userId, role: "super_admin" } });
    },
    onSuccess: () => {
      toast.success("Rol global actualizado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h2 className="text-sm font-semibold">Usuarios y permisos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Todo el manejo de usuarios de Riel: invitar personas al workspace, asignar su rol y
          plantilla de permisos, y otorgar acceso de super administrador global.
        </p>
      </div>

      {/* Invite form */}
      <section className="border border-border rounded-md p-4 space-y-3 bg-card/40">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          <h3 className="text-xs font-semibold uppercase tracking-wider">Invitar usuario</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input
              type="email"
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder="persona@empresa.com"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rol</Label>
            <Select value={invRole} onValueChange={(v) => setInvRole(v as any)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Plantilla de permisos</Label>
            <Select
              value={invTpl || "__none"}
              onValueChange={(v) => setInvTpl(v === "__none" ? "" : v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Sin plantilla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin plantilla</SelectItem>
                {(templates.data ?? []).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            disabled={!invEmail || !wsId || inviteM.isPending}
            onClick={() =>
              inviteM.mutate(
                { email: invEmail, role: invRole, roleTemplateId: invTpl || null },
                {
                  onSuccess: () => {
                    setInvEmail("");
                    setInvTpl("");
                  },
                },
              )
            }
          >
            Invitar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Si el email ya está registrado, se agrega directo al workspace. Si no, se le envía una
          invitación.
        </p>
      </section>

      {/* Pending invitations */}
      {(invites.data ?? []).length > 0 && (
        <section className="border border-border rounded-md overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-between gap-2">
            <span>Invitaciones pendientes</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!wsId || materializeM.isPending}
              onClick={() => materializeM.mutate()}
              title="Crea el usuario en auth para que sea asignable sin esperar a que se loguee"
            >
              {materializeM.isPending ? "Creando…" : "Crear usuarios ahora"}
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">Rol</th>
                <th className="text-left px-3 py-2 font-medium">Plantilla</th>
                <th className="text-left px-3 py-2 font-medium">Enviada</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(invites.data ?? []).map((inv: any) => {
                const tpl = (templates.data ?? []).find((t: any) => t.id === inv.role_template_id);
                return (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-3 py-2">{inv.email}</td>
                    <td className="px-3 py-2 text-xs">{inv.role}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{tpl?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {inv.created_at
                        ? new Date(inv.created_at).toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => cancelM.mutate(inv.id)}
                        title="Cancelar invitación"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Users table */}
      <section className="border border-border rounded-md overflow-hidden">
        <div className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider">
          Usuarios registrados
        </div>
        {users.isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">Cargando…</div>
        ) : users.error ? (
          <div className="p-4 text-xs text-destructive">{(users.error as Error).message}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Usuario</th>
                <th className="text-left px-3 py-2 font-medium">
                  Rol en {primaryWs?.name ?? "workspace"}
                </th>
                <th className="text-left px-3 py-2 font-medium">Plantilla</th>
                <th className="text-left px-3 py-2 font-medium">Super admin</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => {
                const m = membersByUser.get(u.id);
                return (
                  <tr key={u.id} className="border-t border-border align-middle">
                    <td className="px-3 py-2">
                      <div className="text-sm">{u.full_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      {m ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => roleM.mutate({ memberId: m.id, role: v })}
                        >
                          <SelectTrigger className="h-7 text-xs w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sin acceso</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {m ? (
                        <Select
                          value={m.role_template_id ?? "__none"}
                          onValueChange={(v) =>
                            tplM.mutate({
                              memberId: m.id,
                              templateId: v === "__none" ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-52">
                            <SelectValue placeholder="Sin plantilla" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Sin plantilla</SelectItem>
                            {(templates.data ?? []).map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={u.is_super_admin}
                        onCheckedChange={(v) => saToggle.mutate({ userId: u.id, enable: v })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {m && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`¿Quitar a ${u.full_name ?? u.email} del workspace?`))
                              rmM.mutate(m.id);
                          }}
                          title="Quitar del workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(users.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No hay usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
