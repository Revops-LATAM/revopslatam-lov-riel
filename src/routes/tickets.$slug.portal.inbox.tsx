import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ticket, LogOut, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/tickets/$slug/portal/inbox")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Mis tickets" }, { name: "robots", content: "noindex" }],
  }),
  component: PortalInbox,
});

type TicketRow = {
  id: string;
  title: string;
  request_type: "incidencia" | "requerimiento" | null;
  severity: "normal" | "urgente_critico" | null;
  sla_target_response_at: string | null;
  sla_target_resolution_at: string | null;
  created_at: string;
  updated_at: string;
  submitter_email: string | null;
  sprint_id: string | null;
  task_statuses: { name: string; category: string; color: string | null } | null;
  sprints: {
    id: string;
    sprint_number: number | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
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

function statusMeta(category: string | undefined | null, name: string | undefined | null) {
  const m = STATUS_LABEL[category ?? ""];
  if (m) return m;
  return { label: name ?? "—", tone: "bg-muted text-muted-foreground border-border" };
}

function slaTone(target: string | null): "ok" | "warn" | "late" | null {
  if (!target) return null;
  const diff = parseISO(target).getTime() - Date.now();
  if (diff < 0) return "late";
  if (diff < 4 * 60 * 60 * 1000) return "warn";
  return "ok";
}

function PortalInbox() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    email: string;
    role?: "member" | "leader";
    project: { name: string | null; account: string | null };
    tickets: TicketRow[];
  } | null>(null);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch(`/api/public/portal/${slug}/tickets`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = `/tickets/${slug}`;
          return null;
        }
        if (!r.ok) throw new Error("Error");
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => setError("No se pudieron cargar tus tickets."));
  }, [slug]);

  const logout = async () => {
    setLoggingOut(true);
    await fetch(`/api/public/portal/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.href = `/tickets/${slug}`;
  };

  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLeader = data.role === "leader";
  const visible =
    isLeader && scope === "mine"
      ? data.tickets.filter(
          (t) => (t.submitter_email ?? "").toLowerCase() === data.email.toLowerCase(),
        )
      : data.tickets;

  // Agrupación por sprint (sólo relevante para el líder).
  const groups = (() => {
    if (!isLeader) return [{ key: "all", label: "", tickets: visible }];
    const map = new Map<
      string,
      { key: string; label: string; order: string; tickets: TicketRow[] }
    >();
    for (const t of visible) {
      const key = t.sprint_id ?? "sin-sprint";
      const label =
        t.sprints?.sprint_number != null ? `Sprint ${t.sprints.sprint_number}` : "Sin sprint";
      const order = t.sprints?.start_date ?? "0000-00-00";
      const g = map.get(key) ?? { key, label, order, tickets: [] };
      g.tickets.push(t);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "sin-sprint") return 1;
      if (b.key === "sin-sprint") return -1;
      return b.order.localeCompare(a.order);
    });
  })();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {data.project.account ?? "Portal"}
            </div>
            <h1 className="text-lg font-semibold">{data.project.name ?? "Tickets"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground hidden sm:block">{data.email}</div>
            <Button variant="ghost" size="sm" onClick={logout} disabled={loggingOut}>
              <LogOut className="w-4 h-4 mr-1.5" /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">
              {isLeader && scope === "all" ? "Tickets de tu equipo" : "Mis tickets"} (
              {visible.length})
            </h2>
            {isLeader && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                Líder
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLeader && (
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`px-2.5 py-1 ${scope === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setScope("mine")}
                  className={`px-2.5 py-1 ${scope === "mine" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  Míos
                </button>
              </div>
            )}
            <Link
              to="/tickets/$slug/new"
              params={{ slug }}
              className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              + Nuevo ticket
            </Link>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            No hay tickets aún.
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="space-y-2">
              {isLeader && (
                <div className="flex items-baseline gap-2 pt-2">
                  <h3 className="text-sm font-semibold">{g.label}</h3>
                  <span className="text-xs text-muted-foreground">({g.tickets.length})</span>
                </div>
              )}
              <ul className="space-y-2">
                {g.tickets.map((t) => {
                  const st = statusMeta(t.task_statuses?.category, t.task_statuses?.name);
                  const resTone = slaTone(t.sla_target_resolution_at);
                  return (
                    <li key={t.id}>
                      <Link
                        to="/tickets/$slug/portal/t/$ticketId"
                        params={{ slug, ticketId: t.id }}
                        className="block rounded-lg border bg-card p-4 hover:border-foreground/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">#{t.id.slice(0, 8)}</span>
                              {t.request_type && (
                                <>
                                  <span>·</span>
                                  <span>
                                    {t.request_type === "incidencia"
                                      ? "Incidencia"
                                      : "Requerimiento"}
                                  </span>
                                </>
                              )}
                              {t.severity === "urgente_critico" && (
                                <Badge variant="destructive" className="h-4 text-[10px]">
                                  {t.request_type === "incidencia" ? "Crítico" : "Urgente"}
                                </Badge>
                              )}
                            </div>
                            <div className="font-medium mt-0.5 truncate">{t.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {isLeader && t.submitter_email && (
                                <>
                                  <span>{t.submitter_email}</span>
                                  <span> · </span>
                                </>
                              )}
                              Actualizado{" "}
                              {formatDistanceToNow(parseISO(t.updated_at), {
                                addSuffix: true,
                                locale: es,
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${st.tone}`}>
                              {st.label}
                            </span>
                            {resTone && (
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] ${
                                  resTone === "late"
                                    ? "text-destructive"
                                    : resTone === "warn"
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {resTone === "late" ? (
                                  <AlertTriangle className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {resTone === "late"
                                  ? "SLA vencido"
                                  : resTone === "warn"
                                    ? "SLA por vencer"
                                    : "SLA en plazo"}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
