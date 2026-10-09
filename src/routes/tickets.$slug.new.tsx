import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Ticket, Loader2, Paperclip, X, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/tickets/$slug/new")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nuevo ticket" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewTicketPage,
});

type FieldCfg = { label?: string; required?: boolean };
type FormSchema = {
  areas?: string[];
  fields?: Partial<Record<"title" | "request_type" | "area" | "severity" | "description", FieldCfg>>;
};

const DEFAULT_AREAS = ["Marketing", "Ventas", "Servicio", "Operaciones"];
const DEFAULT_LABELS: Required<NonNullable<FormSchema["fields"]>> = {
  title: { label: "Título", required: true },
  request_type: { label: "Tipo de solicitud", required: true },
  area: { label: "Área", required: true },
  severity: { label: "Criticidad / Prioridad", required: true },
  description: { label: "Descripción", required: true },
};

function fieldCfg(schema: FormSchema | null, key: keyof typeof DEFAULT_LABELS): Required<FieldCfg> {
  const f = schema?.fields?.[key];
  return {
    label: f?.label?.trim() || DEFAULT_LABELS[key].label!,
    required: f?.required ?? DEFAULT_LABELS[key].required!,
  };
}

function NewTicketPage() {
  const { slug } = Route.useParams();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [requestType, setRequestType] = useState<"incidencia" | "requerimiento">("requerimiento");
  const [area, setArea] = useState<string>(DEFAULT_AREAS[0]);
  const [severity, setSeverity] = useState<"normal" | "urgente_critico">("normal");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const MAX_FILES = 3;
  const MAX_BYTES = 10 * 1024 * 1024;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessRes, schRes] = await Promise.all([
          fetch(`/api/public/portal/${slug}`, { credentials: "include" }),
          fetch(`/api/public/tickets/${slug}`),
        ]);
        const sess = await sessRes.json().catch(() => ({}));
        if (!sess?.authenticated) {
          window.location.href = `/tickets/${slug}`;
          return;
        }
        if (cancelled) return;
        setEmail(sess.email);
        const sj = await schRes.json().catch(() => ({}));
        const s = (sj.schema ?? {}) as FormSchema;
        setSchema(s);
        if (s.areas && s.areas.length > 0) setArea(s.areas[0]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const areas = schema?.areas && schema.areas.length > 0 ? schema.areas : DEFAULT_AREAS;
  const cfgTitle = fieldCfg(schema, "title");
  const cfgType = fieldCfg(schema, "request_type");
  const cfgArea = fieldCfg(schema, "area");
  const cfgSev = fieldCfg(schema, "severity");
  const cfgDesc = fieldCfg(schema, "description");

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" supera 10MB.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const removeFile = (idx: number) => setFiles(files.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!email) return;
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("title", title);
      fd.set("request_type", requestType);
      fd.set("area", area);
      fd.set("severity", severity);
      fd.set("description", description);
      for (const f of files) fd.append("files", f);
      const resp = await fetch(`/api/public/tickets/${slug}`, { method: "POST", body: fd });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error ?? "Error");
      setSent(json.ticketId);
      setTitle("");
      setDescription("");
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (!cfgTitle.required || title.trim()) &&
    (!cfgDesc.required || description.trim()) &&
    (!cfgArea.required || area.trim()) &&
    !loading;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4 py-12">
      <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-sm">
        <header className="p-5 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            <h1 className="text-base font-semibold">Nuevo ticket</h1>
          </div>
          <Link
            to="/tickets/$slug/portal/inbox"
            params={{ slug }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Mis tickets
          </Link>
        </header>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <h2 className="text-base font-semibold">¡Ticket recibido!</h2>
            <p className="text-sm text-muted-foreground">
              ID: <span className="font-mono text-foreground">#{sent.slice(0, 8)}</span>. Te avisaremos por email cuando haya novedades.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSent(null)}>
                Enviar otro
              </Button>
              <Link to="/tickets/$slug/portal/inbox" params={{ slug }} className="flex-1">
                <Button className="w-full">Ver mis tickets</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="text-xs text-muted-foreground">
              Enviando como <span className="text-foreground">{email}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">
                {cfgTitle.label}
                {cfgTitle.required && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Resumen breve"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  {cfgType.label}
                  {cfgType.required && <span className="text-destructive"> *</span>}
                </Label>
                <Select
                  value={requestType}
                  onValueChange={(v) => {
                    setRequestType(v as typeof requestType);
                    setSeverity("normal");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incidencia">Incidencia</SelectItem>
                    <SelectItem value="requerimiento">Requerimiento</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {requestType === "incidencia"
                    ? "Algo que dejó de funcionar o no funciona como antes."
                    : "Algo nuevo que necesitas que se haga."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  {cfgArea.label}
                  {cfgArea.required && <span className="text-destructive"> *</span>}
                </Label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {cfgSev.label}
                {cfgSev.required && <span className="text-destructive"> *</span>}
              </Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente_critico">
                    {requestType === "incidencia" ? "Crítico" : "Urgente"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">
                {cfgDesc.label}
                {cfgDesc.required && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Cuéntanos los detalles…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Adjuntos <span className="text-muted-foreground font-normal">(opcional, hasta {MAX_FILES} archivos · 10MB c/u)</span></Label>
              <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground border border-dashed border-border rounded-md px-3 py-3 cursor-pointer hover:bg-muted/50 transition">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{files.length >= MAX_FILES ? "Máximo alcanzado" : "Agregar archivos"}</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={files.length >= MAX_FILES}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                      <span className="truncate mr-2">{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span></span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Quitar ${f.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button onClick={submit} disabled={!canSubmit} className="w-full">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar ticket
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
