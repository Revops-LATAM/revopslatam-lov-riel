import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import {
  Mail,
  AlertTriangle,
  Clock,
  CheckCircle2,
  MessageCircleQuestion,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  notifyTicketResolved,
  notifyTicketQuestion,
} from "@/lib/api/ticket-notifications.functions";
import { updateTask } from "@/lib/api/tasks.functions";

type TicketTask = {
  id: string;
  submitter_email?: string | null;
  request_type?: "incidencia" | "requerimiento" | null;
  severity?: "normal" | "urgente_critico" | null;
  sla_target_response_at?: string | null;
  sla_target_resolution_at?: string | null;
};

function ShortTicketId({ id }: { id: string }) {
  const short = `#${id.slice(0, 8)}`;
  const [copied, setCopied] = useState<"none" | "short" | "full">("none");
  const copy = async (val: string, kind: "short" | "full") => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(kind);
      toast.success(kind === "short" ? `Copiado ${val}` : "ID completo copiado");
      setTimeout(() => setCopied("none"), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <button
        type="button"
        onClick={() => copy(short, "short")}
        className="font-mono px-1.5 py-0.5 rounded border border-border bg-muted hover:bg-accent transition-colors"
        title={`Copiar ${short} — click para copiar la referencia corta`}
      >
        {copied === "short" ? "¡copiado!" : short}
      </button>
      <button
        type="button"
        onClick={() => copy(id, "full")}
        className="text-muted-foreground hover:text-foreground underline decoration-dotted"
        title={`Copiar ID completo: ${id}`}
      >
        {copied === "full" ? "¡copiado!" : "copiar ID completo"}
      </button>
    </div>
  );
}

function slaStatus(target?: string | null): {
  tone: "ok" | "warn" | "late";
  label: string;
} | null {
  if (!target) return null;
  const t = parseISO(target);
  const now = new Date();
  const diffMin = (t.getTime() - now.getTime()) / 60000;
  if (diffMin < 0) {
    return { tone: "late", label: `Vencido hace ${formatDistanceToNowStrict(t, { locale: es })}` };
  }
  if (diffMin < 60 * 4) {
    return { tone: "warn", label: `Vence en ${formatDistanceToNowStrict(t, { locale: es })}` };
  }
  return { tone: "ok", label: `En plazo · ${format(t, "dd/MM HH:mm", { locale: es })}` };
}

const TONE_CLASS: Record<"ok" | "warn" | "late", string> = {
  ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  late: "bg-destructive/10 text-destructive border-destructive/30",
};

export function TicketPanel({ task, isResolved }: { task: TicketTask; isResolved: boolean }) {
  const [askOpen, setAskOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const qc = useQueryClient();
  const askFn = useServerFn(notifyTicketQuestion);
  const resolveFn = useServerFn(notifyTicketResolved);
  const updateFn = useServerFn(updateTask);

  // Editable submitter email
  const [editEmail, setEditEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(task.submitter_email ?? "");
  useEffect(() => {
    if (!editEmail) setEmailDraft(task.submitter_email ?? "");
  }, [task.submitter_email, editEmail]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task", task.id] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const updateMut = useMutation({
    mutationFn: (vars: {
      submitterEmail?: string | null;
      requestType?: "incidencia" | "requerimiento" | null;
      severity?: "normal" | "urgente_critico" | null;
    }) => updateFn({ data: { taskId: task.id, ...vars } as never }),
    onSuccess: () => {
      invalidate();
      toast.success("Ticket actualizado");
    },
    onError: (e: Error) => toast.error("No se pudo actualizar", { description: e.message }),
  });

  const askMut = useMutation({
    mutationFn: () => askFn({ data: { taskId: task.id, question: question.trim() } }),
    onSuccess: () => {
      toast.success("Pregunta enviada al cliente");
      setAskOpen(false);
      setQuestion("");
    },
    onError: (e: Error) => toast.error("No se pudo enviar", { description: e.message }),
  });
  const resolveMut = useMutation({
    mutationFn: () =>
      resolveFn({
        data: {
          taskId: task.id,
          resolutionNote: resolutionNote.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Notificación enviada al cliente");
      setResolveOpen(false);
      setResolutionNote("");
    },
    onError: (e: Error) => toast.error("No se pudo enviar", { description: e.message }),
  });

  const response = slaStatus(task.sla_target_response_at);
  const resolution = slaStatus(task.sla_target_resolution_at);

  const saveEmail = () => {
    const trimmed = emailDraft.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Email inválido");
      return;
    }
    updateMut.mutate({ submitterEmail: trimmed ? trimmed : null });
    setEditEmail(false);
  };

  return (
    <div className="border-t border-border px-5 sm:px-6 py-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Ticket de cliente
        </div>
        <ShortTicketId id={task.id} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-card">
          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground text-xs shrink-0">Solicitante:</span>
          {editEmail ? (
            <>
              <Input
                autoFocus
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEmail();
                  if (e.key === "Escape") {
                    setEditEmail(false);
                    setEmailDraft(task.submitter_email ?? "");
                  }
                }}
                placeholder="correo@cliente.cl"
                className="h-7 text-sm px-2"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={saveEmail}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setEditEmail(false);
                  setEmailDraft(task.submitter_email ?? "");
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditEmail(true)}
              className="truncate text-left flex-1 hover:underline decoration-dotted"
              title="Editar solicitante"
            >
              {task.submitter_email ?? (
                <span className="text-muted-foreground italic">Agregar…</span>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-card">
          <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground text-xs shrink-0">Tipo:</span>
          <Select
            value={task.request_type ?? "none"}
            onValueChange={(v) =>
              updateMut.mutate({
                requestType: v === "none" ? null : (v as "incidencia" | "requerimiento"),
              })
            }
          >
            <SelectTrigger className="h-7 border-0 shadow-none px-1 focus:ring-0 w-auto min-w-[110px]">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="incidencia">Incidencia</SelectItem>
              <SelectItem value="requerimiento">Requerimiento</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">·</span>
          <Select
            value={task.severity ?? "none"}
            onValueChange={(v) =>
              updateMut.mutate({
                severity: v === "none" ? null : (v as "normal" | "urgente_critico"),
              })
            }
          >
            <SelectTrigger className="h-7 border-0 shadow-none px-1 focus:ring-0 w-auto min-w-[90px]">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgente_critico">
                {task.request_type === "incidencia" ? "Crítico" : "Urgente"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {response && (
          <div
            className={`flex items-center gap-2 px-3 py-2 border rounded-md text-xs ${TONE_CLASS[response.tone]}`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">1ª respuesta:</span>
            <span>{response.label}</span>
          </div>
        )}
        {resolution && (
          <div
            className={`flex items-center gap-2 px-3 py-2 border rounded-md text-xs ${TONE_CLASS[resolution.tone]}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-medium">Resolución:</span>
            <span>{resolution.label}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAskOpen(true)}
          disabled={!task.submitter_email}
        >
          <MessageCircleQuestion className="w-4 h-4 mr-1.5" />
          Preguntar al cliente
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => setResolveOpen(true)}
          disabled={!task.submitter_email || !isResolved}
          title={!isResolved ? "Marca el ticket como resuelto/completado primero" : undefined}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          Notificar resolución
        </Button>
      </div>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preguntar al cliente</DialogTitle>
            <DialogDescription>
              Se enviará por email a {task.submitter_email} y quedará como comentario visible para
              el cliente.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="¿Qué necesitas preguntarle al cliente?"
            rows={5}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAskOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => askMut.mutate()} disabled={!question.trim() || askMut.isPending}>
              Enviar pregunta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notificar resolución</DialogTitle>
            <DialogDescription>
              Se enviará un email a {task.submitter_email} confirmando que el ticket fue resuelto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="Nota opcional sobre la resolución…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => resolveMut.mutate()} disabled={resolveMut.isPending}>
              Enviar notificación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
