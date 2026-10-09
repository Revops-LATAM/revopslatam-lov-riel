import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllWorkspaces } from "@/lib/api/admin.functions";
import {
  listRoleTemplates,
  createRoleTemplate,
  updateRoleTemplate,
  deleteRoleTemplate,
  ALL_PERMISSIONS,
  type WorkspacePermission,
} from "@/lib/api/permissions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Shield, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/permissions")({
  head: () => ({ meta: [{ title: "Plantillas de permisos · Riel" }] }),
  component: AdminRoleTemplates,
});

const PERMISSION_LABELS: Record<WorkspacePermission, { label: string; group: string; desc: string }> = {
  ops_view: { group: "Operaciones", label: "Ver", desc: "Ver clientes, contratos y tareas." },
  ops_manage: { group: "Operaciones", label: "Gestionar", desc: "Crear/editar contratos, sprints, fases." },
  workload_view: { group: "Operaciones", label: "Ver carga de trabajo", desc: "Acceso al panel de carga." },
  reports_view: { group: "Análisis", label: "Ver reportes", desc: "Acceso a la sección de reportes." },
  finance_view: { group: "Finanzas", label: "Ver", desc: "Ver resumen, pagos y monedas." },
  finance_manage: { group: "Finanzas", label: "Gestionar", desc: "Editar pagos, monedas y contratos financieros." },
  marketing_view: { group: "Marketing y Ventas", label: "Ver", desc: "Ver el espacio Marketing y Ventas y sus proyectos." },
  marketing_manage: { group: "Marketing y Ventas", label: "Gestionar", desc: "Crear/editar proyectos y tareas de Marketing y Ventas." },
  internal_view: { group: "Interno", label: "Ver", desc: "Ver el espacio Interno (reuniones, formación, eventos, admin)." },
  internal_manage: { group: "Interno", label: "Gestionar", desc: "Crear/editar proyectos, tareas y categorías internas." },
  admin_members: { group: "Admin", label: "Miembros", desc: "Invitar, editar y eliminar miembros." },
  admin_roles: { group: "Admin", label: "Roles y permisos", desc: "Crear/editar plantillas de roles." },
  admin_settings: { group: "Admin", label: "Ajustes", desc: "Configuración general del workspace." },
  admin_capacity: { group: "Admin", label: "Tiempo y capacidad", desc: "Capacidad, feriados y zona horaria." },
};

const GROUP_ORDER = ["Operaciones", "Análisis", "Finanzas", "Marketing y Ventas", "Interno", "Admin"];

function AdminRoleTemplates() {
  const qc = useQueryClient();
  const fetchWs = useServerFn(listAllWorkspaces);
  const fetchTpls = useServerFn(listRoleTemplates);
  const createFn = useServerFn(createRoleTemplate);
  const updateFn = useServerFn(updateRoleTemplate);
  const deleteFn = useServerFn(deleteRoleTemplate);

  const workspaces = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => fetchWs() });
  const [wsId, setWsId] = useState<string | null>(null);
  const activeWs = wsId ?? workspaces.data?.[0]?.id ?? null;

  const templates = useQuery({
    queryKey: ["role-templates", activeWs],
    queryFn: () => fetchTpls({ data: { workspaceId: activeWs! } }),
    enabled: !!activeWs,
  });

  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    description: string;
    permissions: WorkspacePermission[];
    is_system?: boolean;
  }>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["role-templates", activeWs] });

  const create = useMutation({
    mutationFn: (v: { name: string; description?: string; permissions: WorkspacePermission[] }) =>
      createFn({ data: { workspaceId: activeWs!, ...v } }),
    onSuccess: () => {
      toast.success("Rol creado");
      invalidate();
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { templateId: string; name: string; description: string; permissions: WorkspacePermission[] }) =>
      updateFn({
        data: {
          workspaceId: activeWs!,
          templateId: v.templateId,
          name: v.name,
          description: v.description || null,
          permissions: v.permissions,
        },
      }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      invalidate();
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (templateId: string) =>
      deleteFn({ data: { templateId, workspaceId: activeWs! } }),
    onSuccess: () => {
      toast.success("Rol eliminado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4" /> Plantillas de permisos
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Conjuntos reutilizables de permisos. La asignación a cada persona se gestiona desde{" "}
          <span className="text-foreground">Usuarios y permisos</span>.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          disabled={!activeWs}
          onClick={() => setEditing({ name: "", description: "", permissions: [] })}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Nueva plantilla
        </Button>
      </div>

      {!activeWs ? (
        <div className="text-xs text-muted-foreground">Cargando…</div>
      ) : templates.isLoading ? (
        <div className="text-xs text-muted-foreground">Cargando…</div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {(templates.data ?? []).length === 0 && (
            <div className="p-4 text-xs text-muted-foreground italic">Sin plantillas aún.</div>
          )}
          {(templates.data ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {t.name}
                  {t.is_system && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
                      <Lock className="w-2.5 h-2.5" /> sistema
                    </span>
                  )}
                </div>
                {t.description && (
                  <div className="text-xs text-muted-foreground truncate">{t.description}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {(t.permissions as WorkspacePermission[]).length} permisos
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditing({
                    id: t.id,
                    name: t.name,
                    description: t.description ?? "",
                    permissions: (t.permissions ?? []) as WorkspacePermission[],
                    is_system: t.is_system,
                  })
                }
              >
                Editar
              </Button>
              {!t.is_system && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    if (confirm(`¿Eliminar la plantilla "${t.name}"?`)) del.mutate(t.id);
                  }}
                  aria-label="Eliminar plantilla"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RoleEditorDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            if (editing.id) {
              update.mutate({
                templateId: editing.id,
                name: v.name,
                description: v.description,
                permissions: v.permissions,
              });
            } else {
              create.mutate({
                name: v.name,
                description: v.description || undefined,
                permissions: v.permissions,
              });
            }
          }}
          saving={create.isPending || update.isPending}
        />
      )}
    </div>
  );
}

function RoleEditorDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: { id?: string; name: string; description: string; permissions: WorkspacePermission[]; is_system?: boolean };
  onClose: () => void;
  onSave: (v: { name: string; description: string; permissions: WorkspacePermission[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(value.name);
  const [description, setDescription] = useState(value.description);
  const [perms, setPerms] = useState<Set<WorkspacePermission>>(new Set(value.permissions));

  const grouped = useMemo(() => {
    const g = new Map<string, WorkspacePermission[]>();
    for (const p of ALL_PERMISSIONS) {
      const grp = PERMISSION_LABELS[p].group;
      if (!g.has(grp)) g.set(grp, []);
      g.get(grp)!.push(p);
    }
    return g;
  }, []);

  const toggle = (p: WorkspacePermission) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {value.id
              ? value.is_system
                ? `Editar plantilla del sistema · ${value.name}`
                : "Editar plantilla"
              : "Nueva plantilla"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-3">
            <Label>Permisos</Label>
            <div className="space-y-3 max-h-80 overflow-auto pr-1">
              {GROUP_ORDER.map((grp) => (
                <div key={grp} className="border border-border rounded-md p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {grp}
                  </div>
                  <div className="space-y-2">
                    {(grouped.get(grp) ?? []).map((p) => {
                      const meta = PERMISSION_LABELS[p];
                      return (
                        <label key={p} className="flex items-start gap-2 text-sm cursor-pointer">
                          <Checkbox checked={perms.has(p)} onCheckedChange={() => toggle(p)} />
                          <div className="flex-1">
                            <div className="font-medium">{meta.label}</div>
                            <div className="text-xs text-muted-foreground">{meta.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave({ name: name.trim(), description: description.trim(), permissions: Array.from(perms) })
            }
            disabled={saving || !name.trim()}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
