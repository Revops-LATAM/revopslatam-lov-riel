import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import {
  getTask,
  updateTask,
  deleteTask,
  listWorkspaceMembers,
} from "@/lib/api/tasko.functions";
import {
  PRIORITY_OPTIONS,
  PRIORITY_ICON,
} from "@/lib/tasko-constants";
import { dueTone, dueToneClass } from "@/lib/tasko-utils";
import { useTaskTypeMeta, getLucideIcon } from "@/lib/task-type-meta";
import { MultiAssigneeSelect } from "./MultiAssigneeSelect";
import { setTaskAssignees } from "@/lib/api/tasks.functions";
import { upsertTaskCalendarEvent } from "@/lib/api/calendar.functions";

import { MemberAvatar } from "./MemberAvatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecurrenceDialog } from "./RecurrenceDialog";
import { DependenciesSection } from "./DependenciesSection";
import { SubtasksTab } from "./SubtasksTab";
import { CommentsTab } from "./CommentsTab";
import { AttachmentsTab } from "./AttachmentsTab";
import { TimeTab } from "./TimeTab";
import { TicketPanel } from "./TicketPanel";
import { notifyTicketResolved } from "@/lib/api/ticket-notifications.functions";
import { listMarketingPhases } from "@/lib/api/marketing-phases.functions";

import {
  Trash2,
  X,
  Check,
  Calendar as CalendarIcon,
  Loader2,
  Copy,
  CheckCheck,
  Sparkles,
  MoreHorizontal,
  Link as LinkIcon,
  ListChecks,
  Clock,
  Plus,
  Paperclip,
  MessageSquare,
  Repeat,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";


const EFFORT_LABELS = {
  flexible: "Flexible",
  basic: "Básico",
  fixed_daily: "Fijo diario",
  due_date: "En fecha límite",
} as const;

type SaveState = "idle" | "saving" | "saved" | "error";

type TaskWithAssignees = {
  id: string;
  assignee_id?: string | null;
  assignees?: Array<{ user_id: string }> | null;
};

function patchTaskAssignees<T extends Record<string, unknown>>(task: T, userIds: string[]): T {
  return {
    ...task,
    assignee_id: userIds[0] ?? null,
    assignees: userIds.map((user_id) => ({ user_id })),
  } as T;
}

export function TaskDetailDrawer({
  taskId,
  workspaceId,
  onClose,
}: {
  taskId: string | null;
  workspaceId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchTask = useServerFn(getTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const setAssigneesFn = useServerFn(setTaskAssignees);


  const open = !!taskId;

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask({ data: { taskId: taskId! } }),
    enabled: open,
  });

  const membersQuery = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => fetchMembers({ data: { workspaceId } }),
    enabled: open && !!workspaceId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["subtasks"] });
    qc.invalidateQueries({ queryKey: ["my-tasks"] });
  };

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upsertMeetingFn = useServerFn(upsertTaskCalendarEvent);
  const updateMut = useMutation({
    mutationFn: (vars: {
      taskId: string;
      title?: string;
      description?: string | null;
      status?: string;
      statusId?: string | null;
      priority?: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      startDate?: string | null;
      position?: number;
      taskTypeId?: string | null;
      phaseId?: string | null;
      meetingStartTime?: string | null;
      meetingDurationMinutes?: number | null;
      meetingTimezone?: string | null;
    }) => updateFn({ data: vars as never }),
    onMutate: async (vars) => {
      setSaveState("saving");
      // Optimistic patch for instant UI feedback (status, priority, assignee, dates...)
      await qc.cancelQueries({ queryKey: ["task", vars.taskId] });
      const prevTask = qc.getQueryData<Record<string, unknown>>(["task", vars.taskId]);
      if (prevTask) {
        const patch: Record<string, unknown> = {};
        if (vars.title !== undefined) patch.title = vars.title;
        if (vars.description !== undefined) patch.description = vars.description;
        if (vars.status !== undefined) patch.status = vars.status;
        if (vars.statusId !== undefined) patch.status_id = vars.statusId;
        if (vars.priority !== undefined) patch.priority = vars.priority;
        if (vars.assigneeId !== undefined) patch.assignee_id = vars.assigneeId;
        if (vars.dueDate !== undefined) patch.due_date = vars.dueDate;
        if (vars.startDate !== undefined) patch.start_date = vars.startDate;
        if (vars.taskTypeId !== undefined) patch.task_type_id = vars.taskTypeId;
        if (vars.phaseId !== undefined) patch.phase_id = vars.phaseId;
        qc.setQueryData(["task", vars.taskId], { ...prevTask, ...patch });
      }
      // Patch any task lists in cache so the board/list updates instantly
      const listKeys = ["tasks", "my-tasks"];
      const snapshots: Array<[unknown, unknown]> = [];
      for (const key of listKeys) {
        qc.getQueriesData<unknown>({ queryKey: [key] }).forEach(([qKey, data]) => {
          if (!Array.isArray(data)) return;
          snapshots.push([qKey, data]);
          const next = (data as Array<Record<string, unknown>>).map((t) =>
            t.id === vars.taskId
              ? {
                  ...t,
                  ...(vars.title !== undefined && { title: vars.title }),
                  ...(vars.status !== undefined && { status: vars.status }),
                  ...(vars.statusId !== undefined && { status_id: vars.statusId }),
                  ...(vars.priority !== undefined && { priority: vars.priority }),
                  ...(vars.assigneeId !== undefined && { assignee_id: vars.assigneeId }),
                  ...(vars.dueDate !== undefined && { due_date: vars.dueDate }),
                  ...(vars.taskTypeId !== undefined && { task_type_id: vars.taskTypeId }),
                  ...(vars.phaseId !== undefined && { phase_id: vars.phaseId }),
                }
              : t,
          );
          qc.setQueryData(qKey, next);
        });
      }
      return { prevTask, snapshots };
    },
    onSuccess: (_res, vars) => {
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 1600);
      // Auto-sync Google Calendar event for meeting tasks when a relevant field changed
      const meetingKeys = ["title", "description", "dueDate", "meetingStartTime", "meetingDurationMinutes", "meetingTimezone"];
      if (meetingKeys.some((k) => (vars as Record<string, unknown>)[k] !== undefined)) {
        upsertMeetingFn({ data: { taskId: vars.taskId } })
          .then((r) => {
            if (r && typeof r === "object" && "ok" in r && r.ok === false) {
              const reason = (r as { reason?: string }).reason;
              if (reason === "no_connection" || reason === "needs_reauth") {
                toast.warning("Conecta Google Calendar para crear el evento", {
                  description: "Ve a Mi cuenta → Conexiones",
                });
              }
            }
          })
          .catch((e: Error) => {
            console.error("[meeting sync]", e);
          });
      }
    },
    onError: (e: Error, vars, ctx) => {
      // Roll back
      if (ctx?.prevTask) qc.setQueryData(["task", vars.taskId], ctx.prevTask);
      ctx?.snapshots?.forEach(([qKey, data]) => qc.setQueryData(qKey as readonly unknown[], data as never));
      setSaveState("error");
      toast.error("Error al guardar", { description: e.message });
    },
    onSettled: () => {
      // Background reconcile (no UI flicker because cache already matches)
      invalidate();
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { taskId: taskId! } }),
    onSuccess: () => {
      toast.success("Tarea eliminada");
      setConfirmDelete(false);
      onClose();
      invalidate();
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const t = taskQuery.data as (typeof taskQuery.data & { task_type_id?: string | null; status_id?: string | null; submitter_email?: string | null; project_id?: string | null; phase_id?: string | null }) | undefined;

  // Marketing / internal project phases (empty for others)
  const fetchPhases = useServerFn(listMarketingPhases);
  const phasesQuery = useQuery({
    queryKey: ["marketing-phases", t?.project_id],
    queryFn: () => fetchPhases({ data: { projectId: t!.project_id! } }),
    enabled: !!t?.project_id,
  });
  const phases = phasesQuery.data ?? [];

  // Dynamic task types + statuses by workspace
  const meta = useTaskTypeMeta(workspaceId);
  const taskType = t?.task_type_id ? meta.typeById.get(t.task_type_id) ?? null : null;
  const TypeIcon = taskType ? getLucideIcon(taskType.icon) : null;
  const typeStatuses = taskType ? (meta.statusesByType.get(taskType.id) ?? []) : [];
  const currentStatus = t?.status_id
    ? meta.statusById.get(t.status_id) ?? null
    : (typeStatuses.find((s) => s.key === t?.status) ?? null);
  const isCompleted = currentStatus
    ? currentStatus.category === "completada"
    : t?.status === "completada";
  const completedStatus = typeStatuses.find((s) => s.category === "completada");
  const reopenStatus =
    typeStatuses.find((s) => s.is_default) ??
    typeStatuses.find((s) => s.category === "abierta");

  // Auto-notify client when a ticket transitions to "resolved" (completada)
  const notifyResolvedFn = useServerFn(notifyTicketResolved);
  const lastNotifiedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!t?.id) return;
    if (taskType?.key !== "ticket") return;
    if (!isCompleted) return;
    if (!t.submitter_email) return;
    if (lastNotifiedIdRef.current === t.id) return;
    lastNotifiedIdRef.current = t.id;
    // Idempotency key on the server dedupes repeated calls
    notifyResolvedFn({ data: { taskId: t.id } })
      .then(() => toast.success("Cliente notificado de la resolución"))
      .catch((e: Error) => {
        // Silent on idempotent / no-op; surface real errors
        if (!/duplicate|idempot/i.test(e.message)) {
          toast.error("No se pudo notificar al cliente", { description: e.message });
        }
      });
  }, [t?.id, isCompleted, taskType?.key, t?.submitter_email, notifyResolvedFn]);

  const toggleComplete = () => {
    if (!t) return;
    if (isCompleted) {
      lastNotifiedIdRef.current = null; // allow re-notify if reopened and resolved again
      if (reopenStatus) updateMut.mutate({ taskId: t.id, statusId: reopenStatus.id });
      else updateMut.mutate({ taskId: t.id, status: "planificada" });
    } else {
      if (completedStatus) updateMut.mutate({ taskId: t.id, statusId: completedStatus.id });
      else updateMut.mutate({ taskId: t.id, status: "completada" });
    }
  };

  // Auto-save: title + description
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const currentTaskId = t?.id;

  useEffect(() => {
    if (t) {
      setTitleDraft(t.title);
      setDescDraft(t.description ?? "");
    }
     
  }, [currentTaskId]);

  useEffect(() => {
    if (open && t && titleInputRef.current) {
      const el = titleInputRef.current;
      const id = window.setTimeout(() => el.focus(), 80);
      return () => window.clearTimeout(id);
    }
     
  }, [open, currentTaskId]);

  const pendingTitle = useRef<string | null>(null);
  const pendingDesc = useRef<string | null>(null);

  useEffect(() => {
    if (!t) return;
    const v = titleDraft.trim();
    if (v === "" || v === t.title) {
      pendingTitle.current = null;
      return;
    }
    pendingTitle.current = v;
    const id = window.setTimeout(() => {
      updateMut.mutate({ taskId: t.id, title: v });
      pendingTitle.current = null;
    }, 600);
    return () => window.clearTimeout(id);
     
  }, [titleDraft]);

  useEffect(() => {
    if (!t) return;
    if (descDraft === (t.description ?? "")) {
      pendingDesc.current = null;
      return;
    }
    pendingDesc.current = descDraft;
    const id = window.setTimeout(() => {
      updateMut.mutate({ taskId: t.id, description: descDraft || null });
      pendingDesc.current = null;
    }, 600);
    return () => window.clearTimeout(id);
     
  }, [descDraft]);

  useEffect(() => {
    return () => {
      const id = currentTaskId;
      if (!id) return;
      if (pendingTitle.current && pendingTitle.current.length > 0) {
        updateMut.mutate({ taskId: id, title: pendingTitle.current });
        pendingTitle.current = null;
      }
      if (pendingDesc.current !== null) {
        updateMut.mutate({ taskId: id, description: pendingDesc.current || null });
        pendingDesc.current = null;
      }
    };
     
  }, [currentTaskId]);

  const titleEmpty = titleDraft.trim() === "";

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      if (t && titleEmpty) {
        setTitleDraft(t.title);
        pendingTitle.current = null;
      }
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [open, titleDraft, currentTaskId]);

  // Auto-grow the title textarea
  useEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [titleDraft]);

  const members = membersQuery.data ?? [];
  const creator = t ? members.find((m) => m.user_id === t.created_by) : null;

  const currentAssigneeIds = t
    ? (() => {
        const ids = ((t as TaskWithAssignees).assignees ?? []).map((a) => a.user_id);
        const fallback = (t as TaskWithAssignees).assignee_id;
        return ids.length > 0 || !fallback ? ids : [fallback];
      })()
    : [];

  const [copied, setCopied] = useState(false);
  const copyId = () => {
    if (!t) return;
    navigator.clipboard.writeText(t.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
    toast.success("ID copiado");
  };
  const copyLink = () => {
    if (!t) return;
    const url = `${window.location.origin}${window.location.pathname}?task=${t.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Enlace copiado");
  };
  // Toolbar → tabs wiring (signals to focus inputs / open file picker)
  const [activeTab, setActiveTab] = useState<"subtasks" | "time" | "comments" | "files" | "deps">(
    "time",
  );
  const [subFocusSignal, setSubFocusSignal] = useState(0);

  const [uploadSignal, setUploadSignal] = useState(0);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);

  // Default tab per task type: task→time, ticket/meeting→activity
  const lastDefaultForTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (!t?.id) return;
    if (lastDefaultForTaskRef.current === t.id) return;
    lastDefaultForTaskRef.current = t.id;
    if (taskType?.key === "ticket" || taskType?.key === "reunion") {
      setActiveTab("comments");
    } else {
      setActiveTab("time");
    }
  }, [t?.id, taskType?.key]);

  const openSubtask = () => {
    setActiveTab("subtasks");
    setSubFocusSignal((n) => n + 1);
  };
  const openAttach = () => {
    setActiveTab("files");
    setUploadSignal((n) => n + 1);
  };
  const openComment = () => {
    setActiveTab("comments");
    setComposerFocusSignal((n) => n + 1);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto p-0 gap-0">
        <VisuallyHidden>
          <SheetTitle>{t?.title ?? "Detalle de tarea"}</SheetTitle>
          <SheetDescription>
            Edita título, estado, prioridad, asignado, fecha, descripción, subtareas, comentarios y adjuntos.
          </SheetDescription>
        </VisuallyHidden>

        {!t && taskQuery.isLoading && (
          <div className="p-6 space-y-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-24" />
            </div>
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!t && !taskQuery.isLoading && open && (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-medium">Tarea no encontrada</p>
            <p className="text-sm text-muted-foreground">
              Puede haber sido eliminada o movida, o no tienes acceso a ella.
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )}

        {t && (
          <>
            {/* ===== Top bar ===== */}
            <SheetHeader className="px-5 sm:px-6 py-2.5 pr-14 border-b border-border flex-row items-center justify-between space-y-0 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border"
                  style={taskType ? {
                    color: taskType.color,
                    borderColor: `${taskType.color}55`,
                    backgroundColor: `${taskType.color}14`,
                  } : undefined}
                >
                  {TypeIcon ? <TypeIcon className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5 text-muted-foreground" />}
                  {taskType?.name ?? "Tarea"}
                </span>
                <button
                  type="button"
                  onClick={copyId}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Copiar ID de tarea"
                  title={t.id}
                >
                  #{t.id.slice(0, 8)}
                  {copied ? <CheckCheck className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                </button>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-gradient-to-r from-primary/10 to-primary/5 text-primary/70 cursor-not-allowed"
                        aria-disabled="true"
                      >
                        <Sparkles className="w-3 h-3" />
                        Ask AI
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Próximamente</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <SaveIndicator state={saveState} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground"
                  aria-label="Copiar enlace"
                  onClick={copyLink}
                >
                  <LinkIcon className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-8 h-8 text-muted-foreground hover:text-foreground"
                      aria-label="Más acciones"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={copyLink}>
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Copiar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={copyId}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar ID
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setRecurrenceOpen(true)}>
                      <Repeat className="w-4 h-4 mr-2" />
                      Repetir tarea…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar tarea
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SheetHeader>
            {(() => {
              const x = t as unknown as {
                project?: { name?: string | null; color?: string | null } | null;
                sprint?: { sprint_number?: number | null } | null;
                phase?: { name?: string | null } | null;
              };
              if (!x.project?.name && !x.sprint && !x.phase) return null;
              return (
                <div className="px-5 sm:px-6 py-1.5 border-b border-border flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                  <span className="shrink-0">Proyecto:</span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: x.project?.color ?? "#94a3b8" }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground truncate">{x.project?.name ?? "—"}</span>
                  {x.sprint?.sprint_number != null && (
                    <>
                      <span aria-hidden="true">/</span>
                      <span className="shrink-0">Sprint</span>
                      <span className="font-medium text-foreground">{x.sprint.sprint_number}</span>
                    </>
                  )}
                  {!x.sprint && x.phase?.name && (
                    <>
                      <span aria-hidden="true">/</span>
                      <span className="shrink-0">Fase</span>
                      <span className="font-medium text-foreground truncate">{x.phase.name}</span>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ===== Title row with quick-complete ===== */}
            <div className="px-5 sm:px-6 pt-6 pb-5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={toggleComplete}
                  aria-label={isCompleted ? "Marcar como pendiente" : "Marcar como hecha"}
                  className={`mt-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isCompleted
                      ? "bg-status-done border-status-done text-background"
                      : "border-muted-foreground/40 hover:border-status-done hover:bg-status-done/10"
                  }`}
                >
                  {isCompleted && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <textarea
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        titleInputRef.current?.blur();
                      }
                    }}
                    rows={1}
                    aria-invalid={titleEmpty}
                    aria-label="Título de tarea"
                    aria-describedby={titleEmpty ? "title-error" : undefined}
                    placeholder="Sin título"
                    className={`w-full resize-none bg-transparent border-0 outline-none text-[26px] font-semibold leading-tight tracking-tight placeholder:text-muted-foreground/60 focus:outline-none ${
                      titleEmpty ? "text-destructive" : isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  />
                  {titleEmpty && (
                    <p id="title-error" className="text-[11px] text-destructive mt-1">
                      El título no puede estar vacío
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ===== Property cards (Wrike-style hero) ===== */}
            <div className="px-5 sm:px-6 pb-3">
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 ${
                  t.priority !== "none" ? "lg:grid-cols-5" : "lg:grid-cols-4"
                } gap-2`}
              >
                {/* Estado */}
                <Select
                  value={currentStatus?.id ?? ""}
                  onValueChange={(v) => updateMut.mutate({ taskId: t.id, statusId: v })}
                  disabled={typeStatuses.length === 0}
                >
                  <SelectTrigger
                    className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-2.5 border rounded-lg shadow-none hover:border-primary/40 transition-colors [&>svg]:hidden text-left"
                    style={currentStatus ? {
                      backgroundColor: `${currentStatus.color}1a`,
                      borderColor: `${currentStatus.color}55`,
                    } : undefined}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Estado
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: currentStatus?.color ?? "#94a3b8" }}
                      />
                      {currentStatus?.name ?? "—"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {typeStatuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>


                {/* Asignados (multi) */}
                <div className="min-h-[64px] flex flex-col items-start gap-1 px-3 py-2.5 border border-border rounded-lg bg-card hover:border-primary/40 transition-colors">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Asignados
                  </span>
                  <div className="flex items-center gap-2 -ml-1">
                    <MultiAssigneeSelect
                      members={members}
                      value={currentAssigneeIds}
                      onChange={async (ids) => {
                        const previousTask = qc.getQueryData<Record<string, unknown>>(["task", t.id]);
                        const snapshots = qc.getQueriesData<unknown>({ queryKey: ["tasks"] });
                        setSaveState("saving");
                        qc.setQueryData(["task", t.id], (old: Record<string, unknown> | undefined) =>
                          old ? patchTaskAssignees(old, ids) : old,
                        );
                        snapshots.forEach(([qKey, data]) => {
                          if (!Array.isArray(data)) return;
                          qc.setQueryData(
                            qKey,
                            (data as Array<Record<string, unknown>>).map((row) =>
                              row.id === t.id ? patchTaskAssignees(row, ids) : row,
                            ),
                          );
                        });
                        try {
                          await setAssigneesFn({ data: { taskId: t.id, userIds: ids } });
                          setSaveState("saved");
                          if (savedTimer.current) clearTimeout(savedTimer.current);
                          savedTimer.current = setTimeout(() => setSaveState("idle"), 1600);
                          invalidate();
                          qc.invalidateQueries({ queryKey: ["entries", t.id] });
                          qc.invalidateQueries({ queryKey: ["taskEstimates", t.id] });
                          // Sync attendees on Google Calendar for meeting tasks
                          if (taskType?.key === "reunion") {
                            upsertMeetingFn({ data: { taskId: t.id } }).catch((err: Error) =>
                              console.error("[meeting sync]", err),
                            );
                          }
                        } catch (e) {
                          if (previousTask) qc.setQueryData(["task", t.id], previousTask);
                          snapshots.forEach(([qKey, data]) => qc.setQueryData(qKey, data));
                          setSaveState("error");
                          toast.error("No se pudo actualizar asignados", {
                            description: (e as Error).message,
                          });
                        }
                      }}
                    />
                  </div>
                </div>


                {/* Fechas: inicio + límite */}
                <div className="min-h-[64px] flex flex-col items-start gap-1 px-3 py-2.5 border border-border rounded-lg bg-card hover:border-primary/40 transition-colors">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Fechas
                  </span>
                  <div className="w-full -ml-1 space-y-0.5">
                    <DateField
                      label="Inicio"
                      value={t.start_date}
                      maxDate={t.due_date}
                      onChange={(v) => updateMut.mutate({ taskId: t.id, startDate: v })}
                    />
                    <DateField
                      label="Límite"
                      value={t.due_date}
                      minDate={t.start_date}
                      tone={dueToneClass(dueTone(t.due_date, t.status))}
                      onChange={(v) => updateMut.mutate({ taskId: t.id, dueDate: v })}
                    />
                  </div>
                </div>

                {/* Reunión (solo tareas tipo reunión) */}
                {taskType?.key === "reunion" && (
                  <div className="min-h-[64px] flex flex-col items-start gap-2 px-3 py-2.5 border border-border rounded-lg bg-card hover:border-primary/40 transition-colors col-span-2">
                    <div className="w-full flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Reunión
                      </span>
                      {(t as { google_event_html_link?: string | null }).google_event_html_link && (
                        <a
                          href={(t as { google_event_html_link: string }).google_event_html_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <CalendarIcon className="w-3 h-3" />
                          Abrir en Google Calendar
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full">
                      <label className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Hora</span>
                        <Input
                          type="time"
                          className="h-8 w-[110px]"
                          value={(t as { meeting_start_time?: string | null }).meeting_start_time?.slice(0, 5) ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateMut.mutate({
                              taskId: t.id,
                              meetingStartTime: v || null,
                            });
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Duración</span>
                        <Select
                          value={String(
                            (t as { meeting_duration_minutes?: number | null }).meeting_duration_minutes ?? 60,
                          )}
                          onValueChange={(v) =>
                            updateMut.mutate({
                              taskId: t.id,
                              meetingDurationMinutes: parseInt(v, 10),
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[110px]" />
                          <SelectContent>
                            {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                              <SelectItem key={m} value={String(m)}>
                                {m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <div className="text-[11px] text-muted-foreground">
                        Estimado: {(() => {
                          const dur = (t as { meeting_duration_minutes?: number | null }).meeting_duration_minutes ?? 0;
                          const n = currentAssigneeIds.length || 1;
                          const hrs = Math.round(((dur / 60) * n) * 100) / 100;
                          return dur > 0
                            ? `${(dur / 60).toString().replace(/\.0$/, "")}h × ${n} = ${hrs}h`
                            : "—";
                        })()}
                      </div>
                    </div>
                    {!(t as { google_event_id?: string | null }).google_event_id && (
                      <p className="text-[11px] text-muted-foreground">
                        Se creará el evento en el Google Calendar del creador cuando hora, duración y fecha estén completos.
                      </p>
                    )}
                  </div>
                )}


                {/* Esfuerzo (Wrike-style effort mode) */}
                <Select
                  value={(t as { effort_mode?: string }).effort_mode ?? "flexible"}
                  onValueChange={(v) =>
                    (updateMut.mutate as (vars: Record<string, unknown>) => void)({
                      taskId: t.id,
                      effortMode: v,
                    })
                  }
                >
                  <SelectTrigger className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-2.5 border border-border rounded-lg shadow-none bg-card hover:border-primary/40 transition-colors [&>svg]:hidden text-left">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Esfuerzo
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {EFFORT_LABELS[((t as { effort_mode?: string }).effort_mode ?? "flexible") as keyof typeof EFFORT_LABELS]}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(EFFORT_LABELS) as Array<[string, string]>).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Prioridad (solo si está definida) */}
                {t.priority !== "none" && (
                  <Select
                    value={t.priority}
                    onValueChange={(v) => updateMut.mutate({ taskId: t.id, priority: v })}
                  >
                    <SelectTrigger className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-2.5 border border-border rounded-lg shadow-none bg-card hover:border-primary/40 transition-colors [&>svg]:hidden text-left">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Prioridad
                      </span>
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {PRIORITY_ICON[t.priority]}
                        {PRIORITY_OPTIONS.find((o) => o.value === t.priority)?.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <span className="flex items-center gap-2">
                            {PRIORITY_ICON[o.value]} {o.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Fase (marketing/internal projects) — oculta si la tarea está en un sprint */}
                {phases.length > 0 && !(t as { sprint_id?: string | null }).sprint_id && (
                  <Select
                    value={t.phase_id ?? "_none"}
                    onValueChange={(v) =>
                      updateMut.mutate({ taskId: t.id, phaseId: v === "_none" ? null : v })
                    }
                  >
                    <SelectTrigger
                      className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-2.5 border rounded-lg shadow-none bg-card hover:border-primary/40 transition-colors [&>svg]:hidden text-left"
                      style={(() => {
                        const p = phases.find((x) => x.id === t.phase_id);
                        const c = p?.color;
                        return c
                          ? { backgroundColor: `${c}1a`, borderColor: `${c}55` }
                          : undefined;
                      })()}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Fase
                      </span>
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              phases.find((x) => x.id === t.phase_id)?.color ?? "#94a3b8",
                          }}
                        />
                        {phases.find((x) => x.id === t.phase_id)?.name ?? "Sin fase"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Sin fase</SelectItem>
                      {phases.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: p.color ?? "#94a3b8" }}
                            />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* ===== Quick action toolbar ===== */}
            <div className="px-5 sm:px-6 pb-4">
              <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                <ToolbarBtn icon={<Plus className="w-3.5 h-3.5" />} label="Subtarea" onClick={openSubtask} />
                <ToolbarBtn icon={<Paperclip className="w-3.5 h-3.5" />} label="Adjuntar" onClick={openAttach} />
                <ToolbarBtn icon={<MessageSquare className="w-3.5 h-3.5" />} label="Comentar" onClick={openComment} />
                {t.priority === "none" && (
                  <PriorityQuickAdd
                    onSelect={(v) => updateMut.mutate({ taskId: t.id, priority: v })}
                  />
                )}
                <ToolbarBtn
                  icon={<Check className="w-3.5 h-3.5" />}
                  label={isCompleted ? "Reabrir" : "Completar"}
                  onClick={toggleComplete}
                />
              </div>
            </div>

            {/* ===== Ticket panel (only for ticket type) ===== */}
            {taskType?.key === "ticket" && (
              <TicketPanel
                task={t as unknown as Parameters<typeof TicketPanel>[0]["task"]}
                isResolved={isCompleted}
              />
            )}

            {/* ===== Descripción siempre visible ===== */}
            <div className="border-t border-border px-5 sm:px-6 py-5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Descripción
              </div>
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Añade una descripción más rica: contexto, criterios de éxito, enlaces..."
                rows={6}
                className="border-0 shadow-none focus-visible:ring-0 resize-none p-0 text-sm leading-relaxed bg-transparent min-h-[120px]"
              />
            </div>

            {/* ===== Body (tabs) ===== */}
            <div className="border-t border-border">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as typeof activeTab)}
                className="flex flex-col"
              >
                <div className="px-5 sm:px-6 pt-3 border-b border-border">
                  <TabsList className="h-9 bg-transparent p-0 gap-1 border-0">
                    <TabsTrigger
                      value="time"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent text-muted-foreground px-3 h-9 -mb-px gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Tiempo
                    </TabsTrigger>
                    <TabsTrigger
                      value="comments"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent text-muted-foreground px-3 h-9 -mb-px"
                    >
                      {taskType?.key === "ticket" ? "Conversación" : "Actividad"}
                    </TabsTrigger>
                    {taskType?.key !== "reunion" && (
                      <TabsTrigger
                        value="subtasks"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent text-muted-foreground px-3 h-9 -mb-px"
                      >
                        Subtareas
                      </TabsTrigger>
                    )}
                    <TabsTrigger
                      value="files"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent text-muted-foreground px-3 h-9 -mb-px"
                    >
                      Adjuntos
                    </TabsTrigger>
                    {(t as { contract?: { type?: string } | null }).contract?.type === "implementation" && (
                      <TabsTrigger
                        value="deps"
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent text-muted-foreground px-3 h-9 -mb-px"
                      >
                        Dependencias
                      </TabsTrigger>
                    )}

                  </TabsList>
                </div>

                <TabsContent value="subtasks" className="px-5 sm:px-6 py-5">
                  <SubtasksTab
                    taskId={t.id}
                    projectId={t.project_id}
                    focusNewSignal={subFocusSignal}
                  />
                </TabsContent>

                <TabsContent value="time" className="px-5 sm:px-6 py-5">
                  <TimeTab taskId={t.id} members={membersQuery.data ?? []} />
                </TabsContent>



                <TabsContent value="comments" className="px-5 sm:px-6 py-5">
                  <CommentsTab
                    taskId={t.id}
                    focusComposerSignal={composerFocusSignal}
                    members={membersQuery.data ?? []}
                    isTicket={taskType?.key === "ticket"}
                  />
                </TabsContent>

                <TabsContent value="files" className="px-5 sm:px-6 py-5">
                  <AttachmentsTab taskId={t.id} uploadSignal={uploadSignal} />
                </TabsContent>

                {(t as { contract?: { type?: string } | null }).contract?.type === "implementation" && (
                  <TabsContent value="deps" className="px-5 sm:px-6 py-5">
                    <DependenciesSection taskId={t.id} projectId={t.project_id} />
                  </TabsContent>
                )}
              </Tabs>
            </div>

            {/* ===== Footer discreto: autoría ===== */}
            {t.created_at && (
              <div className="border-t border-border/60 px-5 sm:px-6 py-2.5 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                {creator && (
                  <>
                    <MemberAvatar profile={creator.profile} size={16} />
                    <span>
                      Creada por{" "}
                      <span className="text-foreground/80">
                        {creator.profile?.full_name ?? creator.profile?.email ?? "—"}
                      </span>
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {format(parseISO(t.created_at), "dd/MM/yyyy", { locale: es })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {format(parseISO(t.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {t.completed_at && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-status-done">
                      <Check className="w-3 h-3" />
                      Completada{" "}
                      {format(parseISO(t.completed_at), "dd/MM/yyyy", { locale: es })}
                    </span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar esta tarea?"
        description="La tarea se eliminará permanentemente junto con sus subtareas, comentarios y adjuntos."
        confirmLabel="Eliminar"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
      <RecurrenceDialog
        open={recurrenceOpen}
        taskId={taskId}
        anchorDate={(taskQuery.data as { due_date?: string | null; start_date?: string | null } | undefined)?.due_date ?? (taskQuery.data as { start_date?: string | null } | undefined)?.start_date ?? null}
        onOpenChange={setRecurrenceOpen}
        onCreated={invalidate}
      />
    </Sheet>
  );
}

function ToolbarBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5 rounded-md hover:bg-muted/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PriorityQuickAdd({ onSelect }: { onSelect: (v: string) => void }) {
  return (
    <Select value="none" onValueChange={(v) => v !== "none" && onSelect(v)}>
      <SelectTrigger className="h-7 w-auto gap-1.5 px-2.5 border-0 shadow-none bg-transparent hover:bg-muted/60 text-xs text-muted-foreground hover:text-foreground [&>svg]:hidden">
        <span className="flex items-center gap-1.5">
          <span className="w-1 h-3 rounded bg-muted-foreground/30" />
          Prioridad
        </span>
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_OPTIONS.filter((o) => o.value !== "none").map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-2">
              {PRIORITY_ICON[o.value]} {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


function DateField({
  label,
  value,
  onChange,
  tone,
  minDate,
  maxDate,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  tone?: string;
  minDate?: string | null;
  maxDate?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dateObj = value ? parseISO(value) : undefined;
  const min = minDate ? parseISO(minDate) : undefined;
  const max = maxDate ? parseISO(maxDate) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value ? tone ?? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 w-12 text-left">
            {label}
          </span>
          <CalendarIcon className="w-3 h-3 opacity-60" />
          <span className="flex-1 text-left truncate">
            {dateObj ? format(dateObj, "dd/MM/yyyy", { locale: es }) : "Sin fecha"}
          </span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Quitar ${label.toLowerCase()}`}
              className="opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="single"
          selected={dateObj}
          onSelect={(d) => {
            if (d) onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          disabled={(d) => (min && d < min) || (max && d > max) || false}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Guardando…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="w-3 h-3 text-primary" /> Guardado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-destructive">
      <X className="w-3 h-3" /> Error
    </span>
  );
}

