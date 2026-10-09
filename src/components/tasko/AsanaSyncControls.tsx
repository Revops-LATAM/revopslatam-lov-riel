import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  syncAsanaProjectTasks,
  getAsanaProjectConfig,
  saveAsanaProjectConfig,
  saveAsanaStatusMappings,
  saveAsanaUserMappings,
  listAsanaSections,
  listAsanaCustomFields,
  listAsanaProjectUsers,
  listAsanaWorkspaces,
  subscribeAsanaWebhook,
  unsubscribeAsanaWebhook,
} from "@/lib/api/asana.functions";

type StatusMode = "completed_only" | "sections" | "custom_field";
type StatusMapping = {
  statusId: string;
  asanaValue: string;
  asanaLabel?: string;
  kind: "section" | "custom_field_enum" | "completed_only";
};
type StoredStatusMapping = {
  status_id: string;
  asana_value: string;
  asana_value_label?: string | null;
  kind: "section" | "custom_field_enum" | "completed_only";
};

export function AsanaSyncControls({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const sync = useServerFn(syncAsanaProjectTasks);
  const mut = useMutation({
    mutationFn: () => sync({ data: { projectId, force: true } }),
    onSuccess: (r) => {
      toast.success(
        `Asana: ${r.created} creadas, ${r.updated} actualizadas, ${r.skipped ?? 0} sin cambios`,
      );
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        title="Sincronizar con Asana"
      >
        {mut.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </Button>
      <AsanaConfigDialog projectId={projectId} />
    </div>
  );
}

function AsanaConfigDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Configurar sincronización Asana">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración de sincronización Asana</DialogTitle>
        </DialogHeader>
        {open && <AsanaConfigBody projectId={projectId} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AsanaConfigBody({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const getCfg = useServerFn(getAsanaProjectConfig);
  const saveCfg = useServerFn(saveAsanaProjectConfig);
  const saveStatus = useServerFn(saveAsanaStatusMappings);
  const saveUsers = useServerFn(saveAsanaUserMappings);
  const subscribe = useServerFn(subscribeAsanaWebhook);
  const unsubscribe = useServerFn(unsubscribeAsanaWebhook);

  const cfgQuery = useQuery({
    queryKey: ["asana-cfg", projectId],
    queryFn: () => getCfg({ data: { projectId } }),
  });

  const cfg = cfgQuery.data;
  const [statusMode, setStatusMode] = useState<StatusMode>("completed_only");
  const [fieldGid, setFieldGid] = useState<string>("");
  const [pushEnabled, setPushEnabled] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  if (cfg && !initialized) {
    setStatusMode(
      ((cfg.config as { status_mode?: StatusMode } | null)?.status_mode ??
        "completed_only") as StatusMode,
    );
    setFieldGid(
      (cfg.config as { asana_status_field_gid?: string } | null)?.asana_status_field_gid ?? "",
    );
    setPushEnabled((cfg.config as { push_enabled?: boolean } | null)?.push_enabled ?? true);
    setCommentsEnabled(
      (cfg.config as { comments_enabled?: boolean } | null)?.comments_enabled ?? true,
    );
    setInitialized(true);
  }

  if (cfgQuery.isLoading || !cfg) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Cargando…</div>;
  }

  const asanaProjectGid = cfg.project.asana_project_gid;
  if (!asanaProjectGid) {
    return (
      <div className="py-4 text-sm text-muted-foreground">
        Este proyecto no tiene Asana vinculado.
      </div>
    );
  }

  const handleSaveGeneral = async () => {
    try {
      await saveCfg({
        data: {
          projectId,
          statusMode,
          asanaStatusFieldGid: statusMode === "custom_field" ? fieldGid || null : null,
          pushEnabled,
          commentsEnabled,
        },
      });
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["asana-cfg", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="estados">Estados</TabsTrigger>
        <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
        <TabsTrigger value="webhook">Tiempo real</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Modo de mapeo de estados</Label>
          <Select value={statusMode} onValueChange={(v) => setStatusMode(v as StatusMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed_only">Solo completado / abierto</SelectItem>
              <SelectItem value="sections">Secciones de Asana</SelectItem>
              <SelectItem value="custom_field">Campo personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {statusMode === "custom_field" && (
          <CustomFieldPicker
            asanaProjectGid={asanaProjectGid}
            value={fieldGid}
            onChange={setFieldGid}
          />
        )}

        <div className="flex items-center justify-between">
          <Label htmlFor="push">Push Riel → Asana</Label>
          <Switch id="push" checked={pushEnabled} onCheckedChange={setPushEnabled} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="comments">Sincronizar comentarios</Label>
          <Switch id="comments" checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleSaveGeneral}>Guardar</Button>
        </DialogFooter>
      </TabsContent>

      <TabsContent value="estados" className="pt-4">
        <StatusMappingEditor
          projectId={projectId}
          asanaProjectGid={asanaProjectGid}
          workspaceId={cfg.project.workspace_id}
          statusMode={statusMode}
          fieldGid={fieldGid}
          pushEnabled={pushEnabled}
          commentsEnabled={commentsEnabled}
          existing={cfg.statusMap as unknown as StatusMapping[]}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["asana-cfg", projectId] });
            qc.invalidateQueries({ queryKey: ["tasks", projectId] });
          }}
        />
      </TabsContent>

      <TabsContent value="usuarios" className="pt-4">
        <UserMappingEditor
          projectId={projectId}
          workspaceId={cfg.project.workspace_id}
          existing={
            (cfg.userMap as Array<{
              user_id: string;
              asana_user_gid: string;
              asana_user_name?: string | null;
              asana_user_email?: string | null;
            }>) ?? []
          }
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["asana-cfg", projectId] });
            qc.invalidateQueries({ queryKey: ["tasks", projectId] });
          }}
        />
      </TabsContent>

      <TabsContent value="webhook" className="space-y-4 pt-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Activa el webhook para recibir cambios de Asana en tiempo real (sin esperar el sync de
            15 min).
          </p>
          <div className="flex items-center gap-2">
            <Badge variant={cfg.webhook?.active ? "default" : "outline"}>
              {cfg.webhook?.active ? "Activo" : "Inactivo"}
            </Badge>
            {cfg.webhook?.last_event_at && (
              <span className="text-xs text-muted-foreground">
                Último evento: {new Date(cfg.webhook.last_event_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={async () => {
                try {
                  await subscribe({ data: { projectId } });
                  toast.success("Webhook activado");
                  qc.invalidateQueries({ queryKey: ["asana-cfg", projectId] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              disabled={cfg.webhook?.active === true}
            >
              Activar webhook
            </Button>
            {cfg.webhook && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await unsubscribe({ data: { projectId } });
                    toast.success("Webhook desactivado");
                    qc.invalidateQueries({ queryKey: ["asana-cfg", projectId] });
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Desactivar
              </Button>
            )}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function CustomFieldPicker({
  asanaProjectGid,
  value,
  onChange,
}: {
  asanaProjectGid: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const list = useServerFn(listAsanaCustomFields);
  const q = useQuery({
    queryKey: ["asana-cf", asanaProjectGid],
    queryFn: () => list({ data: { projectGid: asanaProjectGid } }),
  });
  return (
    <div className="space-y-2">
      <Label>Campo personalizado de estado en Asana</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={q.isLoading ? "Cargando…" : "Selecciona campo"} />
        </SelectTrigger>
        <SelectContent>
          {(q.data ?? []).map((f) => (
            <SelectItem key={f.gid} value={f.gid}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatusMappingEditor({
  projectId,
  asanaProjectGid,
  workspaceId,
  statusMode,
  fieldGid,
  pushEnabled,
  commentsEnabled,
  existing,
  onSaved,
}: {
  projectId: string;
  asanaProjectGid: string;
  workspaceId: string;
  statusMode: StatusMode;
  fieldGid: string;
  pushEnabled: boolean;
  commentsEnabled: boolean;
  existing: Array<StatusMapping | StoredStatusMapping>;
  onSaved: () => void;
}) {
  const save = useServerFn(saveAsanaStatusMappings);
  const saveCfg = useServerFn(saveAsanaProjectConfig);
  const syncNow = useServerFn(syncAsanaProjectTasks);
  const sections = useServerFn(listAsanaSections);
  const customFields = useServerFn(listAsanaCustomFields);
  const [saving, setSaving] = useState(false);

  const statusesQ = useQuery({
    queryKey: ["riel-statuses", workspaceId],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: ttype } = await supabase
        .from("task_types")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("key", "tarea")
        .maybeSingle();
      if (!ttype) return [];
      const { data } = await supabase
        .from("task_statuses")
        .select("id, name, color, category, sort_order")
        .eq("task_type_id", ttype.id)
        .order("sort_order");
      return (data ?? []) as Array<{ id: string; name: string; color: string; category: string }>;
    },
  });

  const sectionsQ = useQuery({
    queryKey: ["asana-sections", asanaProjectGid],
    queryFn: () => sections({ data: { projectGid: asanaProjectGid } }),
    enabled: statusMode === "sections",
  });
  const cfQ = useQuery({
    queryKey: ["asana-cf-enum", asanaProjectGid, fieldGid],
    queryFn: async () => {
      const all = await customFields({ data: { projectGid: asanaProjectGid } });
      return all.find((f) => f.gid === fieldGid)?.enum_options ?? [];
    },
    enabled: statusMode === "custom_field" && !!fieldGid,
  });

  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      existing.map((e) => {
        const row = e as StatusMapping & StoredStatusMapping;
        return [row.statusId ?? row.status_id, row.asanaValue ?? row.asana_value];
      }),
    ),
  );

  if (statusMode === "completed_only") {
    return (
      <p className="text-sm text-muted-foreground">
        En modo "Solo completado / abierto" no se necesita mapeo manual. Asana solo conoce si la
        tarea está cerrada o no.
      </p>
    );
  }

  const options =
    statusMode === "sections"
      ? (sectionsQ.data ?? []).map((s) => ({ value: s.gid, label: s.name }))
      : (cfQ.data ?? []).map((o) => ({ value: o.gid, label: o.name }));
  const kind = statusMode === "sections" ? "section" : "custom_field_enum";

  const handleSave = async () => {
    const mappings: StatusMapping[] = Object.entries(mapping)
      .filter(([, v]) => !!v)
      .map(([statusId, asanaValue]) => ({
        statusId,
        asanaValue,
        asanaLabel: options.find((o) => o.value === asanaValue)?.label,
        kind,
      }));
    try {
      setSaving(true);
      await saveCfg({
        data: {
          projectId,
          statusMode,
          asanaStatusFieldGid: statusMode === "custom_field" ? fieldGid || null : null,
          pushEnabled,
          commentsEnabled,
        },
      });
      await save({ data: { projectId, mappings } });
      const result = await syncNow({ data: { projectId, force: true } });
      toast.success(
        `Mapeo aplicado: ${result.created} creadas, ${result.updated} actualizadas, ${result.skipped ?? 0} sin cambios`,
      );
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Cada estado de Riel se mapea a{" "}
        {statusMode === "sections" ? "una sección" : "una opción del campo"} en Asana.
      </p>
      {(statusesQ.data ?? []).map((s) => (
        <div key={s.id} className="grid grid-cols-2 gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-sm">{s.name}</span>
          </div>
          <Select
            value={mapping[s.id] ?? ""}
            onValueChange={(v) => setMapping({ ...mapping, [s.id]: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin mapear" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Guardar y aplicar
        </Button>
      </DialogFooter>
    </div>
  );
}

function UserMappingEditor({
  projectId,
  workspaceId,
  existing,
  onSaved,
}: {
  projectId: string;
  workspaceId: string;
  existing: Array<{
    user_id: string;
    asana_user_gid: string;
    asana_user_name?: string | null;
    asana_user_email?: string | null;
  }>;
  onSaved: () => void;
}) {
  const save = useServerFn(saveAsanaUserMappings);
  const syncNow = useServerFn(syncAsanaProjectTasks);
  const wsList = useServerFn(listAsanaWorkspaces);
  const userList = useServerFn(listAsanaProjectUsers);
  const [saving, setSaving] = useState(false);

  const membersQ = useQuery({
    queryKey: ["ws-members", workspaceId],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId);
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0)
        return [] as Array<{ user_id: string; full_name: string | null; email: string }>;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      return (profs ?? []).map((p) => ({
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
      }));
    },
  });

  const wsQ = useQuery({ queryKey: ["asana-workspaces"], queryFn: () => wsList() });
  const asanaWsGid = wsQ.data?.[0]?.gid;
  const asanaUsersQ = useQuery({
    queryKey: ["asana-users", asanaWsGid],
    queryFn: () => userList({ data: { workspaceGid: asanaWsGid! } }),
    enabled: !!asanaWsGid,
  });

  const [mapping, setMapping] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.map((e) => [e.user_id, e.asana_user_gid])),
  );

  const handleSave = async () => {
    const asanaUsers = asanaUsersQ.data ?? [];
    const mappings = Object.entries(mapping)
      .filter(([, v]) => !!v)
      .map(([userId, asanaUserGid]) => {
        const au = asanaUsers.find((u) => u.gid === asanaUserGid);
        return {
          userId,
          asanaUserGid,
          asanaUserName: au?.name,
          asanaUserEmail: au?.email,
        };
      });
    try {
      setSaving(true);
      await save({ data: { workspaceId, mappings } });
      const result = await syncNow({ data: { projectId, force: true } });
      toast.success(
        `Usuarios aplicados: ${result.created} creadas, ${result.updated} actualizadas, ${result.skipped ?? 0} sin cambios`,
      );
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Empareja cada miembro del workspace con su usuario de Asana.
      </p>
      {(membersQ.data ?? []).map((m) => (
        <div key={m.user_id} className="grid grid-cols-2 gap-2 items-center">
          <div className="text-sm truncate">{m.full_name ?? m.email}</div>
          <Select
            value={mapping[m.user_id] ?? ""}
            onValueChange={(v) => setMapping({ ...mapping, [m.user_id]: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin mapear" />
            </SelectTrigger>
            <SelectContent>
              {(asanaUsersQ.data ?? []).map((u) => (
                <SelectItem key={u.gid} value={u.gid}>
                  {u.name} {u.email ? `(${u.email})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Guardar y aplicar
        </Button>
      </DialogFooter>
    </div>
  );
}
