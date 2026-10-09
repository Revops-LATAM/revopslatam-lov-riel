import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { icons, Plus, Trash2, Star, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { wsBySlugQO, taskTypesQO, taskStatusesQO } from "@/lib/api/tasko.queries";
import { upsertTaskStatus, deleteTaskStatus, updateTaskType } from "@/lib/api/task-types.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RouteError } from "@/components/tasko/RouteError";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/settings/task-types")({
  ssr: false,
  loader: async ({ context, params }) => {
    const ws = await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    await Promise.all([
      context.queryClient.ensureQueryData(taskTypesQO(ws.id)),
      context.queryClient.ensureQueryData(taskStatusesQO(ws.id)),
    ]);
    return null;
  },
  errorComponent: RouteError,
  component: TaskTypesPage,
});

const CATEGORY_OPTS = [
  { value: "abierta", label: "Abierta" },
  { value: "en_progreso", label: "En progreso" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
] as const;

const SUGGESTED_COLORS = [
  "#94a3b8",
  "#64748b",
  "#3b82f6",
  "#0ea5e9",
  "#06b6d4",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#16a34a",
  "#ef4444",
  "#71717a",
];

function DynIcon({ name, className }: { name: string; className?: string }) {
  const I = (icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!I) return null;
  return <I className={className} />;
}

function TaskTypesPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const { data: types } = useSuspenseQuery(taskTypesQO(ws.id));
  const { data: statuses } = useSuspenseQuery(taskStatusesQO(ws.id));
  const qc = useQueryClient();

  const upsert = useServerFn(upsertTaskStatus);
  const del = useServerFn(deleteTaskStatus);
  const updType = useServerFn(updateTaskType);

  const [activeTypeId, setActiveTypeId] = useState<string>(types[0]?.id ?? "");
  const activeType = types.find((t) => t.id === activeTypeId) ?? types[0];

  const list = useMemo(
    () => statuses.filter((s) => s.task_type_id === activeType?.id),
    [statuses, activeType],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["task-statuses", ws.id] });
  const invalidateTypes = () => qc.invalidateQueries({ queryKey: ["task-types", ws.id] });

  const create = useMutation({
    mutationFn: async (vars: {
      name: string;
      color: string;
      category: (typeof CATEGORY_OPTS)[number]["value"];
    }) =>
      upsert({
        data: {
          workspaceId: ws.id,
          taskTypeId: activeType!.id,
          name: vars.name,
          color: vars.color,
          category: vars.category,
          sortOrder: (list.at(-1)?.sort_order ?? 0) + 1,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Estado creado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (vars: {
      id: string;
      name: string;
      color: string;
      category: (typeof CATEGORY_OPTS)[number]["value"];
      isDefault?: boolean;
    }) =>
      upsert({
        data: {
          workspaceId: ws.id,
          taskTypeId: activeType!.id,
          id: vars.id,
          name: vars.name,
          color: vars.color,
          category: vars.category,
          isDefault: vars.isDefault,
        },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Estado eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editType = useMutation({
    mutationFn: async (vars: { id: string; name: string; icon: string; color: string }) =>
      updType({ data: vars }),
    onSuccess: () => {
      invalidateTypes();
      toast.success("Tipo actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [newCategory, setNewCategory] =
    useState<(typeof CATEGORY_OPTS)[number]["value"]>("abierta");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-base font-semibold">Tipos de tarea y estados</h2>
        <p className="text-sm text-muted-foreground">
          Cada tipo de tarea tiene su propio conjunto de estados. Puedes editar nombres, colores y
          agregar nuevos. La categoría se usa internamente para saber si un estado cuenta como
          abierto, en progreso o completado.
        </p>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-6">
        {/* Tipos */}
        <div className="border border-border rounded-lg overflow-hidden h-fit">
          <div className="px-3 py-2 text-xs font-semibold bg-muted/40 border-b border-border">
            Tipos
          </div>
          <ul>
            {types.map((t) => {
              const active = t.id === activeType?.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveTypeId(t.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-b border-border last:border-b-0 transition-colors ${
                      active ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${t.color}22`, color: t.color }}
                    >
                      <DynIcon name={t.icon} className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1">{t.name}</span>
                    {t.is_system && (
                      <span className="text-[10px] text-muted-foreground">sistema</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Estados del tipo activo */}
        <div className="space-y-4">
          {activeType && (
            <TypeHeader
              key={activeType.id}
              type={activeType}
              onSave={(v) => editType.mutate({ id: activeType.id, ...v })}
            />
          )}

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 text-xs font-semibold bg-muted/40 border-b border-border grid grid-cols-[1fr_140px_140px_90px_40px] gap-2">
              <span>Nombre</span>
              <span>Color</span>
              <span>Categoría</span>
              <span>Por defecto</span>
              <span></span>
            </div>

            {list.map((s) => (
              <StatusRow
                key={s.id}
                row={s}
                onUpdate={(v) => update.mutate({ id: s.id, ...v })}
                onMakeDefault={() =>
                  update.mutate({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    category: s.category as (typeof CATEGORY_OPTS)[number]["value"],
                    isDefault: true,
                  })
                }
                onDelete={() => {
                  if (confirm(`¿Eliminar el estado "${s.name}"?`)) remove.mutate(s.id);
                }}
              />
            ))}

            {/* Nuevo estado */}
            <div className="px-3 py-2 grid grid-cols-[1fr_140px_140px_90px_40px] gap-2 items-center border-t border-border bg-muted/20">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nuevo estado…"
                className="h-8"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <Select
                value={newCategory}
                onValueChange={(v) => setNewCategory(v as (typeof CATEGORY_OPTS)[number]["value"])}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span />
              <Button
                size="icon"
                variant="ghost"
                disabled={!newName.trim() || create.isPending}
                onClick={() => {
                  create.mutate({ name: newName.trim(), color: newColor, category: newCategory });
                  setNewName("");
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-full flex items-center gap-2 px-2 border border-input rounded-md text-xs hover:bg-accent"
      >
        <span
          className="w-4 h-4 rounded-sm border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono">{value}</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 p-2 bg-popover border border-border rounded-md shadow-lg w-48">
          <div className="grid grid-cols-5 gap-1 mb-2">
            {SUGGESTED_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="w-7 h-7 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs font-mono"
          />
        </div>
      )}
    </div>
  );
}

function StatusRow({
  row,
  onUpdate,
  onMakeDefault,
  onDelete,
}: {
  row: {
    id: string;
    name: string;
    color: string;
    category: string;
    is_default: boolean;
    is_system: boolean;
  };
  onUpdate: (v: {
    name: string;
    color: string;
    category: (typeof CATEGORY_OPTS)[number]["value"];
  }) => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [color, setColor] = useState(row.color);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTS)[number]["value"]>(
    row.category as (typeof CATEGORY_OPTS)[number]["value"],
  );

  const dirty = name !== row.name || color !== row.color || category !== row.category;

  return (
    <div className="px-3 py-2 grid grid-cols-[1fr_140px_140px_90px_40px] gap-2 items-center border-t border-border">
      <div className="flex items-center gap-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium shrink-0"
          style={{ backgroundColor: `${color}22`, color }}
        >
          ●
        </span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => dirty && onUpdate({ name: name.trim(), color, category })}
          className="h-8"
        />
      </div>
      <ColorPicker
        value={color}
        onChange={(c) => {
          setColor(c);
          onUpdate({ name: name.trim(), color: c, category });
        }}
      />
      <Select
        value={category}
        onValueChange={(v) => {
          const next = v as (typeof CATEGORY_OPTS)[number]["value"];
          setCategory(next);
          onUpdate({ name: name.trim(), color, category: next });
        }}
      >
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_OPTS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        onClick={onMakeDefault}
        title={row.is_default ? "Estado por defecto" : "Marcar como por defecto"}
        className="flex justify-center"
      >
        <Star
          className={`w-4 h-4 ${row.is_default ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`}
        />
      </button>
      <Button
        size="icon"
        variant="ghost"
        disabled={row.is_system}
        onClick={onDelete}
        title={row.is_system ? "Estado del sistema" : "Eliminar"}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function TypeHeader({
  type,
  onSave,
}: {
  type: { id: string; name: string; icon: string; color: string };
  onSave: (v: { name: string; icon: string; color: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(type.name);
  const [icon, setIcon] = useState(type.icon);
  const [color, setColor] = useState(type.color);

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${type.color}22`, color: type.color }}
        >
          <DynIcon name={type.icon} className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-semibold">{type.name}</div>
          <div className="text-xs text-muted-foreground">Estados de este tipo</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1" /> Editar tipo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 border border-border rounded-md bg-muted/20">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-[180px]" />
      <Input
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        placeholder="Icono lucide"
        className="h-8 max-w-[160px]"
        title="Nombre exacto de icono lucide-react (ej: CheckSquare, LifeBuoy, Calendar, Bug)"
      />
      <ColorPicker value={color} onChange={setColor} />
      <Button
        size="sm"
        onClick={() => {
          onSave({ name: name.trim(), icon: icon.trim(), color });
          setEditing(false);
        }}
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setName(type.name);
          setIcon(type.icon);
          setColor(type.color);
          setEditing(false);
        }}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
