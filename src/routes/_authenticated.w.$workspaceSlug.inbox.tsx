import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listInboxEvents,
  syncMyCalendar,
  confirmCalendarEvent,
  ignoreInboxEvent,
  getMyCalendarConnection,
  getProjectAnchors,
  listMyCalendarProjects,
} from "@/lib/api/calendar.functions";
import { wsBySlugQO } from "@/lib/api/tasko.queries";
import { formatDateCL } from "@/lib/date-format";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RouteError } from "@/components/tasko/RouteError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  RefreshCcw,
  Users,
  Clock,
  ExternalLink,
  X,
  Check,
  Inbox as InboxIcon,
  Sparkles,
  UserX,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/inbox")({
  ssr: false,
  head: () => ({ meta: [{ title: "Inbox de calendario · Riel" }] }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(wsBySlugQO(params.workspaceSlug));
    return null;
  },
  errorComponent: RouteError,
  component: InboxPage,
});

function InboxPage() {
  const { workspaceSlug } = Route.useParams();
  const { data: ws } = useSuspenseQuery(wsBySlugQO(workspaceSlug));
  const qc = useQueryClient();

  const fetchConn = useServerFn(getMyCalendarConnection);
  const fetchList = useServerFn(listInboxEvents);
  const sync = useServerFn(syncMyCalendar);

  const connQ = useQuery({
    queryKey: ["calendar-connection", ws.id],
    queryFn: () => fetchConn({ data: { workspaceId: ws.id } }),
  });

  const listQ = useQuery({
    queryKey: ["calendar-inbox", ws.id],
    queryFn: () => fetchList({ data: { workspaceId: ws.id } }),
    enabled: !!connQ.data && connQ.data.status === "active",
  });

  const syncMut = useMutation({
    mutationFn: () => sync({ data: { workspaceId: ws.id } }),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.upserted} eventos`);
      qc.invalidateQueries({ queryKey: ["calendar-inbox", ws.id] });
      qc.invalidateQueries({ queryKey: ["calendar-inbox-count", ws.id] });
      qc.invalidateQueries({ queryKey: ["calendar-connection", ws.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b border-border px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InboxIcon className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Inbox de calendario</h1>
        </div>
        {connQ.data && connQ.data.status === "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
          >
            <RefreshCcw
              className={`w-3.5 h-3.5 mr-1.5 ${syncMut.isPending ? "animate-spin" : ""}`}
            />
            {syncMut.isPending ? "Sincronizando…" : "Sincronizar"}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-6 max-w-4xl w-full mx-auto">
        {connQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : !connQ.data || connQ.data.status !== "active" ? (
          <EmptyConnect workspaceSlug={workspaceSlug} />
        ) : listQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando eventos…</div>
        ) : !listQ.data || listQ.data.length === 0 ? (
          <EmptyZero onSync={() => syncMut.mutate()} syncing={syncMut.isPending} />
        ) : (
          <EventsList events={listQ.data} workspaceId={ws.id} />
        )}
      </div>
    </div>
  );
}

function EmptyConnect({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <div className="border border-dashed border-border rounded-md p-8 text-center">
      <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-3">
        Conecta Google Calendar para empezar a clasificar tus reuniones.
      </p>
      <a href={`/w/${workspaceSlug}/settings`} className="text-sm text-primary hover:underline">
        Ir a Configuración
      </a>
    </div>
  );
}

function EmptyZero({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <div className="border border-dashed border-border rounded-md p-8 text-center">
      <Check className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-3">
        No hay eventos pendientes por clasificar.
      </p>
      <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
        <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
        Sincronizar ahora
      </Button>
    </div>
  );
}

type Preclassified = {
  project_id: string | null;
  sprint_id: string | null;
  phase_id: string | null;
  classified_by: string | null;
  classified_by_name: string | null;
} | null;

type EventRow = {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  attendees_count: number;
  organizer_email: string | null;
  html_link: string | null;
  google_recurring_event_id: string | null;
  inbox_status: string;
  preclassified: Preclassified;
};

function EventsList({ events, workspaceId }: { events: EventRow[]; workspaceId: string }) {
  const fetchProjects = useServerFn(listMyCalendarProjects);
  const projectsQ = useQuery({
    queryKey: ["my-calendar-projects"],
    queryFn: () => fetchProjects(),
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const g = new Map<string, EventRow[]>();
    for (const e of events) {
      const day = new Date(e.start_at).toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (!g.has(day)) g.set(day, []);
      g.get(day)!.push(e);
    }
    return Array.from(g.entries());
  }, [events]);

  return (
    <div className="space-y-6">
      {groups.map(([day, items]) => (
        <section key={day}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {day}
          </h2>
          <div className="space-y-2">
            {items.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                workspaceId={workspaceId}
                projects={projectsQ.data ?? []}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

function EventCard({
  event,
  workspaceId,
  projects,
}: {
  event: EventRow;
  workspaceId: string;
  projects: Array<{
    id: string;
    name: string;
    color: string | null;
    workspace_id: string;
    workspace_name: string;
    workspace_kind: string | null;
  }>;
}) {
  const qc = useQueryClient();
  const confirm = useServerFn(confirmCalendarEvent);
  const ignore = useServerFn(ignoreInboxEvent);
  const fetchAnchors = useServerFn(getProjectAnchors);

  const realMinutes = Math.max(
    1,
    Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000),
  );

  const isPast = new Date(event.end_at).getTime() <= Date.now();

  const pre = event.preclassified;
  const [projectId, setProjectId] = useState<string>(pre?.project_id ?? "");
  const [sprintId, setSprintId] = useState<string>(pre?.sprint_id ?? "");
  const [phaseId, setPhaseId] = useState<string>(pre?.phase_id ?? "");
  const [minutes, setMinutes] = useState<number>(realMinutes);

  // Apply pre-classification if it arrives after mount
  useEffect(() => {
    if (pre?.project_id && !projectId) {
      setProjectId(pre.project_id);
      if (pre.sprint_id) setSprintId(pre.sprint_id);
      if (pre.phase_id) setPhaseId(pre.phase_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre?.project_id]);

  const anchorsQ = useQuery({
    queryKey: ["project-anchors", projectId],
    queryFn: () => fetchAnchors({ data: { projectId: projectId as string } }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["calendar-inbox", workspaceId] });
    qc.invalidateQueries({ queryKey: ["calendar-inbox-count", workspaceId] });
    // Also refresh task lists, time entries and workload so the new
    // reunion task + time entry show up immediately elsewhere.
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["rollups"] });
    qc.invalidateQueries({ queryKey: ["sprint-metrics"] });
    qc.invalidateQueries({ queryKey: ["time-entries"] });
    qc.invalidateQueries({ queryKey: ["my-time"] });
    qc.invalidateQueries({ queryKey: ["workload"] });
  };

  const confirmMut = useMutation({
    mutationFn: () =>
      confirm({
        data: {
          eventId: event.id,
          projectId: projectId,
          sprintId: sprintId || null,
          phaseId: phaseId || null,
          durationMinutes: minutes,
        },
      }),
    onSuccess: (r) => {
      const h = Math.floor(r.minutes / 60);
      const m = r.minutes % 60;
      const label = h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
      const proj = projects.find((p) => p.id === projectId);
      const dest = proj
        ? `${proj.name}${proj.workspace_id !== workspaceId ? ` · ${proj.workspace_name}` : ""}`
        : "";
      toast.success(
        `${isPast ? `Imputado ${label}` : `Agendado (${label})`}${dest ? ` en ${dest}` : ""}`,
      );
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const ignoreMut = useMutation({
    mutationFn: () => ignore({ data: { eventId: event.id } }),
    onSuccess: () => {
      toast.success("Reunión descartada");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const time = event.is_all_day ? "Todo el día" : `${fmt(start)} – ${fmt(end)}`;

  const isCustom = !DURATION_PRESETS.includes(minutes);

  return (
    <div className="border border-border rounded-md p-3 bg-card">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium truncate">{event.title ?? "(Sin título)"}</h3>
            {event.google_recurring_event_id && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Recurrente
              </span>
            )}
            {pre?.project_id && (
              <span
                className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                title={`Clasificado por ${pre.classified_by_name ?? "otro miembro"}`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                Pre-clasificada
                {pre.classified_by_name ? ` por ${pre.classified_by_name}` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {time}
            </span>
            {event.attendees_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {event.attendees_count}
              </span>
            )}
            {event.organizer_email && <span className="truncate">por {event.organizer_email}</span>}
            {event.html_link && (
              <a
                href={event.html_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Ver en Google
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={projectId}
          onValueChange={(v) => {
            setProjectId(v);
            setSprintId("");
            setPhaseId("");
          }}
        >
          <SelectTrigger className="h-8 text-xs flex-1 min-w-[180px]">
            <SelectValue placeholder="Asociar a proyecto…">
              {(() => {
                const sel = projects.find((p) => p.id === projectId);
                if (!sel) return null;
                const showWs = sel.workspace_id !== workspaceId;
                return (
                  <span className="inline-flex items-center gap-2 truncate">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: sel.color ?? "#8b5cf6" }}
                    />
                    <span className="truncate">{sel.name}</span>
                    {showWs && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        · {sel.workspace_name}
                      </span>
                    )}
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(() => {
              const byWs = new Map<string, { name: string; items: typeof projects }>();
              for (const p of projects) {
                if (!byWs.has(p.workspace_id)) {
                  byWs.set(p.workspace_id, {
                    name: p.workspace_name,
                    items: [],
                  });
                }
                byWs.get(p.workspace_id)!.items.push(p);
              }
              const groups = Array.from(byWs.entries()).sort((a, b) => {
                // Current workspace first, then alphabetic
                if (a[0] === workspaceId) return -1;
                if (b[0] === workspaceId) return 1;
                return a[1].name.localeCompare(b[1].name);
              });
              return groups.flatMap(([wsId, g], gi) => [
                <div
                  key={`hdr-${wsId}`}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground ${gi > 0 ? "border-t border-border mt-1 pt-2" : ""}`}
                >
                  {g.name}
                  {wsId === workspaceId && (
                    <span className="ml-1 text-muted-foreground/70">(actual)</span>
                  )}
                </div>,
                ...g.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: p.color ?? "#8b5cf6" }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                )),
              ]);
            })()}
          </SelectContent>
        </Select>

        {projectId &&
          anchorsQ.data?.contractType === "recurrente" &&
          anchorsQ.data.sprints.length > 0 &&
          (() => {
            const evDate = new Date(event.start_at);
            const evDay = new Date(evDate.getFullYear(), evDate.getMonth(), evDate.getDate());
            const sprints = anchorsQ.data.sprints;
            const inRange = sprints.filter((s) => {
              const sd = new Date(s.start_date);
              const ed = new Date(s.end_date);
              return evDay >= sd && evDay <= ed;
            });
            const outRange = sprints.filter((s) => !inRange.includes(s));
            const selectedSprint = sprints.find((s) => s.id === sprintId);
            const isOutOfRange = !!selectedSprint && !inRange.includes(selectedSprint);
            return (
              <div className="flex items-center gap-1 flex-1 min-w-[160px]">
                <Select value={sprintId} onValueChange={setSprintId}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Sprint (opcional)…" />
                  </SelectTrigger>
                  <SelectContent>
                    {inRange.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        ✓ Sprint {s.sprint_number} · {formatDateCL(s.start_date)} –{" "}
                        {formatDateCL(s.end_date)}
                      </SelectItem>
                    ))}
                    {inRange.length > 0 && outRange.length > 0 && (
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-t border-border mt-1">
                        Otros sprints
                      </div>
                    )}
                    {outRange.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        Sprint {s.sprint_number} · {formatDateCL(s.start_date)} –{" "}
                        {formatDateCL(s.end_date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isOutOfRange && (
                  <span
                    className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-500"
                    title={`La reunión es del ${formatDateCL(evDate)}, fuera del Sprint ${selectedSprint.sprint_number} (${formatDateCL(selectedSprint.start_date)}–${formatDateCL(selectedSprint.end_date)})`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            );
          })()}

        {projectId &&
          anchorsQ.data &&
          anchorsQ.data.contractType !== "recurrente" &&
          anchorsQ.data.phases.length > 0 && (
            <Select value={phaseId} onValueChange={setPhaseId}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-[160px]">
                <SelectValue placeholder="Fase (opcional)…" />
              </SelectTrigger>
              <SelectContent>
                {anchorsQ.data.phases.map((ph) => (
                  <SelectItem key={ph.id} value={ph.id}>
                    {ph.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {isPast ? (
          <>
            <span className="text-[11px] text-muted-foreground">Imputar:</span>
            <Select
              value={isCustom ? "custom" : String(minutes)}
              onValueChange={(v) => {
                if (v === "custom") return;
                setMinutes(parseInt(v, 10));
              }}
            >
              <SelectTrigger className="h-8 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatMinutes(m)}
                    {m === realMinutes ? " (real)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
            {isCustom && (
              <div className="inline-flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, parseInt(e.target.value || "0", 10)))}
                  className="h-8 text-xs w-20"
                />
                <span className="text-[11px] text-muted-foreground">min</span>
              </div>
            )}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Estimado: {formatMinutes(realMinutes)} (según calendario)
          </span>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          onClick={() => confirmMut.mutate()}
          disabled={!projectId || confirmMut.isPending}
        >
          <Check className="w-3.5 h-3.5 mr-1" />
          {isPast ? `Confirmar ${formatMinutes(minutes)}` : `Agendar ${formatMinutes(minutes)}`}
        </Button>
        {isPast && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ignoreMut.mutate()}
            disabled={ignoreMut.isPending}
            title="No asistí o no corresponde imputar"
          >
            <UserX className="w-3.5 h-3.5 mr-1" />
            No asistí
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => ignoreMut.mutate()}
          disabled={ignoreMut.isPending}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Descartar
        </Button>
      </div>
    </div>
  );
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}
