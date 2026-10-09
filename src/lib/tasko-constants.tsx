import {
  Circle,
  CircleDot,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  MinusCircle,
  PauseCircle,
  Eye,
  UserCheck,
  Wrench,
  Clock,
} from "lucide-react";
import type { ReactNode } from "react";

export const STATUS_OPTIONS = [
  { value: "nueva", label: "Nueva" },
  { value: "planificada", label: "Planificada" },
  { value: "en_curso", label: "En curso" },
  { value: "en_pausa", label: "En pausa" },
  { value: "revision_interna", label: "Revisión interna" },
  { value: "revision_cliente", label: "Revisión cliente" },
  { value: "en_correccion", label: "En corrección" },
  { value: "demorada", label: "Demorada" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export type TaskStatus = (typeof STATUS_OPTIONS)[number]["value"];

export const PRIORITY_OPTIONS = [
  { value: "none", label: "Sin prioridad" },
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

export type TaskPriority = (typeof PRIORITY_OPTIONS)[number]["value"];

export const STATUS_ICON: Record<string, ReactNode> = {
  nueva: <CircleDashed className="w-3.5 h-3.5 text-status-nueva" />,
  planificada: <Circle className="w-3.5 h-3.5 text-status-planificada" />,
  en_curso: <CircleDot className="w-3.5 h-3.5 text-status-en-curso" />,
  en_pausa: <PauseCircle className="w-3.5 h-3.5 text-status-en-pausa" />,
  revision_interna: <Eye className="w-3.5 h-3.5 text-status-revision-interna" />,
  revision_cliente: <UserCheck className="w-3.5 h-3.5 text-status-revision-cliente" />,
  en_correccion: <Wrench className="w-3.5 h-3.5 text-status-en-correccion" />,
  demorada: <Clock className="w-3.5 h-3.5 text-status-demorada" />,
  completada: <CheckCircle2 className="w-3.5 h-3.5 text-status-completada" />,
  cancelada: <MinusCircle className="w-3.5 h-3.5 text-status-cancelada" />,
};

export const PRIORITY_ICON: Record<string, ReactNode> = {
  none: <span className="w-1 h-3 rounded bg-muted-foreground/30" />,
  low: <span className="w-1 h-3 rounded bg-priority-low" />,
  medium: <span className="w-1 h-3 rounded bg-priority-medium" />,
  high: <span className="w-1 h-3 rounded bg-priority-high" />,
  urgent: <AlertCircle className="w-3.5 h-3.5 text-priority-urgent" />,
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  member: "Miembro",
  guest: "Invitado",
};

// Sprint / phase / contract status labels (UI)
export const SPRINT_STATUS_OPTIONS = [
  { value: "por_planificar", label: "Por planificar" },
  { value: "planificado", label: "Planificado" },
  { value: "en_curso", label: "En curso" },
  { value: "cerrado", label: "Cerrado" },
] as const;

export type SprintStatus = (typeof SPRINT_STATUS_OPTIONS)[number]["value"];

export const PHASE_STATUS_OPTIONS = [
  { value: "sin_iniciar", label: "Sin iniciar" },
  { value: "en_curso", label: "En curso" },
  { value: "demorada", label: "Demorada" },
  { value: "completada", label: "Completada" },
] as const;

export type PhaseStatus = (typeof PHASE_STATUS_OPTIONS)[number]["value"];

export const CONTRACT_STATUS_OPTIONS = [
  { value: "borrador", label: "Borrador" },
  { value: "activo", label: "Activo" },
  { value: "en_renovacion", label: "En renovación" },
  { value: "finalizado", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

export type ContractStatus = (typeof CONTRACT_STATUS_OPTIONS)[number]["value"];

/** Terminal/closed task statuses — exclude from active work counts. */
export const TASK_CLOSED_STATUSES: TaskStatus[] = ["completada", "cancelada"];
