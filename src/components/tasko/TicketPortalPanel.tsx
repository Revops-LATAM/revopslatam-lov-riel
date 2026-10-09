import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getProjectTicketForm,
  ensureProjectTicketForm,
  updateProjectTicketForm,
  updateProjectTicketAreas,
  updateProjectTicketFields,
  updateProjectSlaOverride,
  addAuthorizedEmail,
  removeAuthorizedEmail,
  setAuthorizedEmailRole,
} from "@/lib/api/client-tickets.functions";
import {
  listSlackChannels,
  updateProjectTicketSlack,
  testSlackTicketNotification,
} from "@/lib/api/slack.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Mail,
  Plus,
  Trash2,
  ExternalLink,
  Ticket,
  Save,
  ShieldCheck,
  FormInput,
  Hash,
  Send,
} from "lucide-react";
import { toast } from "sonner";

type AuthorizedEmail = { id: string; email: string; portal_role?: "member" | "leader" | null };
type FieldKey = "title" | "request_type" | "area" | "severity" | "description";
type FieldCfg = { label: string; required: boolean };
type TicketForm = {
  id: string;
  slug: string;
  active: boolean;
  slack_channel_id?: string | null;
  slack_channel_name?: string | null;
  form_schema: {
    areas?: string[];
    fields?: Partial<Record<FieldKey, Partial<FieldCfg>>>;
  } | null;
  authorized_emails: AuthorizedEmail[];
};
type TicketFormResponse = {
  form: TicketForm | null;
  project_sla_id: string | null;
  contract_sla_id: string | null;
  contract_name: string | null;
  workspace_slas: Array<{ id: string; name: string; active: boolean }>;
};

const FIELD_DEFAULTS: Record<FieldKey, FieldCfg> = {
  title: { label: "Título", required: true },
  request_type: { label: "Tipo de solicitud", required: true },
  area: { label: "Área", required: true },
  severity: { label: "Criticidad / Prioridad", required: true },
  description: { label: "Descripción", required: true },
};
const FIELD_ORDER: FieldKey[] = ["title", "request_type", "area", "severity", "description"];

export function TicketPortalPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getProjectTicketForm);
  const ensureFn = useServerFn(ensureProjectTicketForm);
  const updateFn = useServerFn(updateProjectTicketForm);
  const updateAreasFn = useServerFn(updateProjectTicketAreas);
  const updateSlaFn = useServerFn(updateProjectSlaOverride);
  const addFn = useServerFn(addAuthorizedEmail);
  const removeFn = useServerFn(removeAuthorizedEmail);
  const roleFn = useServerFn(setAuthorizedEmailRole);
  const updateFieldsFn = useServerFn(updateProjectTicketFields);

  const formQ = useQuery({
    queryKey: ["ticket-form", projectId],
    queryFn: () => getFn({ data: { projectId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-form", projectId] });

  const ensureMut = useMutation({
    mutationFn: () => ensureFn({ data: { projectId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Portal de tickets habilitado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: (vars: { formId: string; active: boolean }) => updateFn({ data: vars }),
    onSuccess: invalidate,
  });
  const addMut = useMutation({
    mutationFn: (vars: { formId: string; email: string }) => addFn({ data: vars }),
    onSuccess: () => {
      invalidate();
      setNewEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: (emailId: string) => removeFn({ data: { emailId } }),
    onSuccess: invalidate,
  });
  const roleMut = useMutation({
    mutationFn: (vars: { emailId: string; portalRole: "member" | "leader" }) =>
      roleFn({ data: vars }),
    onSuccess: (_r, vars) => {
      invalidate();
      toast.success(
        vars.portalRole === "leader"
          ? "Rol actualizado: ahora ve todos los tickets de su empresa"
          : "Rol actualizado: sólo ve sus propios tickets",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const areasMut = useMutation({
    mutationFn: (vars: { formId: string; areas: string[] }) => updateAreasFn({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Áreas actualizadas");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const slaMut = useMutation({
    mutationFn: (slaId: string | null) => updateSlaFn({ data: { projectId, slaId } }),
    onSuccess: () => {
      invalidate();
      toast.success("SLA del proyecto actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const fieldsMut = useMutation({
    mutationFn: (vars: { formId: string; fields: Record<FieldKey, FieldCfg> }) =>
      updateFieldsFn({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Campos actualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listSlackFn = useServerFn(listSlackChannels);
  const updateSlackFn = useServerFn(updateProjectTicketSlack);
  const testSlackFn = useServerFn(testSlackTicketNotification);

  const slackQ = useQuery({
    queryKey: ["slack-channels"],
    queryFn: () => listSlackFn(),
    staleTime: 5 * 60_000,
  });

  const slackMut = useMutation({
    mutationFn: (vars: { formId: string; channelId: string | null; channelName: string | null }) =>
      updateSlackFn({ data: vars }),
    onSuccess: () => {
      invalidate();
      toast.success("Canal de Slack actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testSlackMut = useMutation({
    mutationFn: (channelId: string) => testSlackFn({ data: { channelId } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Mensaje de prueba enviado a Slack");
        return;
      }
      toast.error(res.error);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newEmail, setNewEmail] = useState("");
  const [areasDraft, setAreasDraft] = useState("");
  const [fieldsDraft, setFieldsDraft] = useState<Record<FieldKey, FieldCfg>>(FIELD_DEFAULTS);

  const resp = formQ.data as TicketFormResponse | null | undefined;
  const form = resp?.form ?? null;

  useEffect(() => {
    if (form?.form_schema?.areas) {
      setAreasDraft(form.form_schema.areas.join(", "));
    }
    const incoming = form?.form_schema?.fields ?? {};
    setFieldsDraft({
      title: { ...FIELD_DEFAULTS.title, ...incoming.title },
      request_type: { ...FIELD_DEFAULTS.request_type, ...incoming.request_type },
      area: { ...FIELD_DEFAULTS.area, ...incoming.area },
      severity: { ...FIELD_DEFAULTS.severity, ...incoming.severity },
      description: { ...FIELD_DEFAULTS.description, ...incoming.description },
    });
  }, [form?.id, form?.form_schema?.areas, form?.form_schema?.fields]);

  if (formQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!form) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="border border-dashed border-border rounded-md p-6 text-center space-y-3">
          <Ticket className="w-8 h-8 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Portal de tickets no habilitado</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Activa el portal para que tu cliente envíe tickets a este proyecto.
            </p>
          </div>
          <Button size="sm" onClick={() => ensureMut.mutate()} disabled={ensureMut.isPending}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Habilitar portal
          </Button>
        </div>
      </div>
    );
  }

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/tickets/${form.slug}`;
  const slaSelectValue = resp?.project_sla_id ?? "__inherit__";

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <section className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">URL pública</h2>
            <p className="text-xs text-muted-foreground">Compártela con los emails autorizados.</p>
          </div>
          <Badge variant={form.active ? "default" : "secondary"}>
            {form.active ? "Activo" : "Inactivo"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input value={url} readOnly className="h-8 text-xs font-mono" />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("URL copiada");
            }}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={form.active}
            onCheckedChange={(v) => toggleMut.mutate({ formId: form.id, active: v })}
          />
          Aceptar nuevos tickets
        </label>
      </section>

      <section className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">SLA del proyecto</h2>
            <p className="text-xs text-muted-foreground">
              Sobrescribe el SLA del contrato para este proyecto. Útil cuando un proyecto requiere
              un acuerdo distinto al estándar.
            </p>
          </div>
        </div>
        <Select
          value={slaSelectValue}
          onValueChange={(v) => slaMut.mutate(v === "__inherit__" ? null : v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit__">
              Heredar del contrato
              {resp?.contract_sla_id
                ? ` · ${resp.workspace_slas.find((s) => s.id === resp.contract_sla_id)?.name ?? "SLA"}`
                : " · sin SLA"}
            </SelectItem>
            {(resp?.workspace_slas ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {!s.active ? " (inactivo)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="border border-border rounded-md p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Áreas del formulario</h2>
          <p className="text-xs text-muted-foreground">
            Lista separada por comas. El cliente las verá como opciones al crear un ticket.
          </p>
        </div>
        <Input
          value={areasDraft}
          onChange={(e) => setAreasDraft(e.target.value)}
          placeholder="Marketing, Ventas, Servicio, Operaciones"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              const areas = areasDraft
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              if (areas.length === 0) {
                toast.error("Debes definir al menos un área");
                return;
              }
              areasMut.mutate({ formId: form.id, areas });
            }}
            disabled={areasMut.isPending}
          >
            <Save className="w-3.5 h-3.5 mr-1" /> Guardar áreas
          </Button>
        </div>
      </section>

      <section className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-start gap-2">
          <FormInput className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Campos del formulario</h2>
            <p className="text-xs text-muted-foreground">
              Personaliza la etiqueta y si cada campo es obligatorio.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {FIELD_ORDER.map((key) => (
            <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <Input
                value={fieldsDraft[key].label}
                onChange={(e) =>
                  setFieldsDraft((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], label: e.target.value },
                  }))
                }
                placeholder={FIELD_DEFAULTS[key].label}
                className="h-8 text-sm"
              />
              <label className="flex items-center gap-2 text-xs whitespace-nowrap">
                <Switch
                  checked={fieldsDraft[key].required}
                  onCheckedChange={(v) =>
                    setFieldsDraft((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], required: v },
                    }))
                  }
                />
                Obligatorio
              </label>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              for (const k of FIELD_ORDER) {
                if (!fieldsDraft[k].label.trim()) {
                  toast.error(`Falta etiqueta en "${FIELD_DEFAULTS[k].label}"`);
                  return;
                }
              }
              fieldsMut.mutate({ formId: form.id, fields: fieldsDraft });
            }}
            disabled={fieldsMut.isPending}
          >
            <Save className="w-3.5 h-3.5 mr-1" /> Guardar campos
          </Button>
        </div>
      </section>

      <section className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Notificaciones en Slack</h2>
            <p className="text-xs text-muted-foreground">
              Elige el canal de Slack donde llegará una notificación cada vez que se cree un nuevo
              ticket desde este portal.
            </p>
          </div>
        </div>
        {slackQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Cargando canales…</div>
        ) : slackQ.data && !slackQ.data.ok ? (
          <div className="text-xs text-destructive">
            No se pudo conectar con Slack: {slackQ.data.error}
          </div>
        ) : (
          <>
            <Select
              value={form.slack_channel_id ?? "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  slackMut.mutate({ formId: form.id, channelId: null, channelName: null });
                  return;
                }
                const ch = slackQ.data?.channels.find((c) => c.id === v);
                slackMut.mutate({
                  formId: form.id,
                  channelId: v,
                  channelName: ch?.name ?? null,
                });
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sin notificación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin notificación</SelectItem>
                {(slackQ.data?.channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.is_private ? "🔒" : "#"} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Si Slack rechaza el envío, invita al bot <b>Lovable App</b> al canal con
              <code className="mx-1 px-1 rounded bg-muted">/invite @Lovable App</code>.
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!form.slack_channel_id || testSlackMut.isPending}
                onClick={() => form.slack_channel_id && testSlackMut.mutate(form.slack_channel_id)}
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Enviar prueba
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="border border-border rounded-md p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Emails autorizados</h2>
          <p className="text-xs text-muted-foreground">
            Solo estos emails podrán enviar tickets desde la URL pública.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="cliente@empresa.com"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEmail.trim()) {
                addMut.mutate({ formId: form.id, email: newEmail.trim() });
              }
            }}
          />
          <Button
            size="sm"
            onClick={() =>
              newEmail.trim() && addMut.mutate({ formId: form.id, email: newEmail.trim() })
            }
            disabled={addMut.isPending || !newEmail.trim()}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
          </Button>
        </div>
        <ul className="divide-y divide-border border border-border rounded-md">
          {form.authorized_emails.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">Aún no hay emails autorizados.</li>
          )}
          {form.authorized_emails.map((e) => (
            <li key={e.id} className="flex items-center gap-2 p-2 px-3">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm">{e.email}</span>
              <Select
                value={e.portal_role === "leader" ? "leader" : "member"}
                onValueChange={(v) =>
                  roleMut.mutate({ emailId: e.id, portalRole: v as "member" | "leader" })
                }
              >
                <SelectTrigger className="ml-auto h-7 w-[190px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Usuario · sólo sus tickets</SelectItem>
                  <SelectItem value="leader">Líder · ve todos los tickets</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => removeMut.mutate(e.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
