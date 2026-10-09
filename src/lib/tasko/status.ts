// Helpers to read task status in a forward-compatible way.
// Prefers the dynamic `task_statuses` join (category/key/name/color/icon) and
// falls back to the legacy enum `status` string when the join is absent.

export type TaskStatusCategory =
  | "abierta"
  | "en_progreso"
  | "bloqueada"
  | "completada"
  | "cancelada";

export interface TaskStatusInfo {
  id: string | null;
  key: string;
  name: string;
  category: TaskStatusCategory;
  color: string | null;
}

interface JoinedStatus {
  id?: string | null;
  key?: string | null;
  name?: string | null;
  category?: TaskStatusCategory | null;
  color?: string | null;
}

interface TaskLike {
  status?: string | null;
  status_id?: string | null;
  task_statuses?: JoinedStatus | JoinedStatus[] | null;
}

// Map legacy enum -> category (for fallback).
const LEGACY_TO_CATEGORY: Record<string, TaskStatusCategory> = {
  nueva: "abierta",
  en_curso: "en_progreso",
  en_pausa: "bloqueada",
  completada: "completada",
  cancelada: "cancelada",
};

const LEGACY_LABEL: Record<string, string> = {
  nueva: "Nueva",
  en_curso: "En curso",
  en_pausa: "En pausa",
  completada: "Completada",
  cancelada: "Cancelada",
};

const CATEGORY_FALLBACK_COLOR: Record<TaskStatusCategory, string> = {
  abierta: "#94a3b8",
  en_progreso: "#3b82f6",
  bloqueada: "#f59e0b",
  completada: "#22c55e",
  cancelada: "#71717a",
};

function pickJoined(t: TaskLike): JoinedStatus | null {
  const j = t.task_statuses;
  if (!j) return null;
  if (Array.isArray(j)) return j[0] ?? null;
  return j;
}

export function getTaskStatus(t: TaskLike | null | undefined): TaskStatusInfo {
  const joined = t ? pickJoined(t) : null;
  if (joined && joined.category) {
    return {
      id: joined.id ?? null,
      key: joined.key ?? "",
      name: joined.name ?? "",
      category: joined.category,
      color: joined.color ?? CATEGORY_FALLBACK_COLOR[joined.category],
    };
  }
  const legacy = (t?.status ?? "nueva") as string;
  const category = LEGACY_TO_CATEGORY[legacy] ?? "abierta";
  return {
    id: t?.status_id ?? null,
    key: legacy,
    name: LEGACY_LABEL[legacy] ?? legacy,
    category,
    color: CATEGORY_FALLBACK_COLOR[category],
  };
}

export const isCompleted = (t: TaskLike | null | undefined) =>
  getTaskStatus(t).category === "completada";
export const isCancelled = (t: TaskLike | null | undefined) =>
  getTaskStatus(t).category === "cancelada";
export const isInProgress = (t: TaskLike | null | undefined) =>
  getTaskStatus(t).category === "en_progreso";
export const isBlocked = (t: TaskLike | null | undefined) =>
  getTaskStatus(t).category === "bloqueada";
export const isOpen = (t: TaskLike | null | undefined) => getTaskStatus(t).category === "abierta";
