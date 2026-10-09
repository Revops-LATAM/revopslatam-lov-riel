import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Send, Clock, AlertTriangle, User, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tickets/$slug/portal/t/$ticketId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Ticket" }, { name: "robots", content: "noindex" }],
  }),
  component: PortalTicketDetail,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  request_type: "incidencia" | "requerimiento" | null;
  severity: "normal" | "urgente_critico" | null;
  sla_target_response_at: string | null;
  sla_target_resolution_at: string | null;
  created_at: string;
  updated_at: string;
  submitter_email?: string | null;
  task_statuses: { name: string; category: string; color: string | null } | null;
  sprints?: { id: string; sprint_number: number | null } | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  client_author_email: string | null;
  profiles: { full_name: string | null } | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  abierta: {
    label: "Recibido",
    tone: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
  },
  en_progreso: {
    label: "En progreso",
    tone: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  },
  esperando_cliente: {
    label: "Esperando tu respuesta",
    tone: "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400",
  },
  bloqueada: {
    label: "Bloqueado",
    tone: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400",
  },
  cerrada: {
    label: "Resuelto",
    tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  },
};

function PortalTicketDetail() {
  const { slug, ticketId } = Route.useParams();
  const [data, setData] = useState<{
    task: Task;
    comments: Comment[];
    role?: "member" | "leader";
  } | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/public/portal/${slug}/tickets/${ticketId}`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = `/tickets/${slug}`;
          return null;
        }
        if (r.status === 404) {
          setError("Ticket no encontrado.");
          return null;
        }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => setError("No se pudo cargar el ticket."));

  useEffect(() => {
    load();
    fetch(`/api/public/portal/${slug}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setMyEmail(d.email ?? null))
      .catch(() => {});
  }, [slug, ticketId]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/public/portal/${slug}/tickets/${ticketId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) throw new Error();
      setReply("");
      toast.success("Respuesta enviada");
      await load();
    } catch {
      toast.error("No se pudo enviar la respuesta");
    } finally {
      setSending(false);
    }
  };

  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const st = STATUS_LABEL[data.task.task_statuses?.category ?? ""] ?? {
    label: data.task.task_statuses?.name ?? "—",
    tone: "bg-muted text-muted-foreground border-border",
  };
  const resTarget = data.task.sla_target_resolution_at;
  const resDiff = resTarget ? parseISO(resTarget).getTime() - Date.now() : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            to="/tickets/$slug/portal/inbox"
            params={{ slug }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a mis tickets
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">#{data.task.id.slice(0, 8)}</span>
            {data.task.request_type && (
              <>
                <span>·</span>
                <span>
                  {data.task.request_type === "incidencia" ? "Incidencia" : "Requerimiento"}
                </span>
              </>
            )}
            {data.task.severity === "urgente_critico" && (
              <Badge variant="destructive" className="h-4 text-[10px]">
                {data.task.request_type === "incidencia" ? "Crítico" : "Urgente"}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold">{data.task.title}</h1>
          {(data.task.sprints?.sprint_number != null ||
            (data.role === "leader" && data.task.submitter_email)) && (
            <div className="text-xs text-muted-foreground">
              {data.task.sprints?.sprint_number != null && (
                <span>Sprint {data.task.sprints.sprint_number}</span>
              )}
              {data.task.sprints?.sprint_number != null &&
                data.role === "leader" &&
                data.task.submitter_email && <span> · </span>}
              {data.role === "leader" && data.task.submitter_email && (
                <span>Solicitado por {data.task.submitter_email}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${st.tone}`}>{st.label}</span>
            {resTarget && resDiff !== null && (
              <span
                className={`inline-flex items-center gap-1 text-xs ${
                  resDiff < 0
                    ? "text-destructive"
                    : resDiff < 4 * 3600_000
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {resDiff < 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                Resolución {resDiff < 0 ? "vencida" : "esperada"}:{" "}
                {format(parseISO(resTarget), "dd/MM HH:mm", { locale: es })}
              </span>
            )}
          </div>
        </div>

        {data.task.description && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Descripción original
            </div>
            <p className="text-sm whitespace-pre-wrap">{data.task.description}</p>
            <div className="text-xs text-muted-foreground pt-1">
              Enviado{" "}
              {formatDistanceToNow(parseISO(data.task.created_at), { addSuffix: true, locale: es })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Conversación
          </h2>
          {data.comments.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              Aún no hay mensajes en este ticket.
            </div>
          ) : (
            <ul className="space-y-3">
              {data.comments.map((c) => {
                const mine = !!c.client_author_email;
                const authorName = mine
                  ? c.client_author_email
                  : (c.profiles?.full_name ?? "Soporte");
                return (
                  <li
                    key={c.id}
                    className={`rounded-lg border p-3 ${mine ? "bg-primary/5 border-primary/20" : "bg-card"}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                      {mine ? (
                        <User className="w-3.5 h-3.5" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium text-foreground">{authorName}</span>
                      <span>·</span>
                      <span>
                        {formatDistanceToNow(parseISO(c.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">Responder</div>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Escribe tu mensaje al equipo de soporte…"
            rows={4}
            disabled={sending}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">Como {myEmail}</div>
            <Button onClick={sendReply} disabled={!reply.trim() || sending}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1.5" /> Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
