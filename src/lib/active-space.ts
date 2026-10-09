import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/lib/permissions";
import type { WorkspacePermission } from "@/lib/api/permissions.functions";

/** Nivel 2 (interno de Operaciones): toggle work/admin. NO TOCAR. */
export type Space = "work" | "admin";

/** Nivel 1: área de la empresa. Vive dentro de un único workspace. */
export type Area = "operations" | "marketing" | "finance" | "internal";

export const ADMIN_PERMISSIONS: WorkspacePermission[] = [
  "finance_view",
  "finance_manage",
  "admin_members",
  "admin_roles",
  "admin_settings",
  "admin_capacity",
];

export const FINANCE_PERMISSIONS: WorkspacePermission[] = ["finance_view", "finance_manage"];
export const MARKETING_PERMISSIONS: WorkspacePermission[] = ["marketing_view", "marketing_manage"];
export const INTERNAL_PERMISSIONS: WorkspacePermission[] = ["internal_view", "internal_manage"];

/** Rutas "espejo": pertenecen a varias áreas (Clientes es compartido entre
 *  Operaciones y Finanzas). No cambian el área activa por sí solas. */
const SHARED_AREA_PATTERNS: RegExp[] = [/\/w\/[^/]+\/accounts(\/|$)/];

export function isSharedAreaRoute(pathname: string): boolean {
  return SHARED_AREA_PATTERNS.some((r) => r.test(pathname));
}

/** Deriva el área activa desde la URL. En rutas compartidas devuelve
 *  `fallback` (típicamente el área persistida) en vez de forzar operations. */
export function deriveActiveArea(pathname: string, fallback?: Area): Area {
  if (/\/w\/[^/]+\/finance(\/|$)/.test(pathname)) return "finance";
  if (/\/w\/[^/]+\/marketing(\/|$)/.test(pathname)) return "marketing";
  if (/\/w\/[^/]+\/internal(\/|$)/.test(pathname)) return "internal";
  if (isSharedAreaRoute(pathname) && fallback) return fallback;
  return "operations";
}

const areaStorageKey = (wsId: string) => `tasko:area:${wsId}`;

/** Hook: devuelve el área activa y persiste la última área "no compartida"
 *  por workspace. En rutas compartidas restaura el área previa. */
export function useDerivedArea(pathname: string, workspaceId: string | undefined): Area {
  const stored: Area | undefined = (() => {
    if (typeof window === "undefined" || !workspaceId) return undefined;
    try {
      const raw = window.localStorage.getItem(areaStorageKey(workspaceId));
      if (raw === "operations" || raw === "marketing" || raw === "finance" || raw === "internal") {
        return raw;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  })();

  const area = deriveActiveArea(pathname, stored);

  useEffect(() => {
    if (!workspaceId) return;
    if (isSharedAreaRoute(pathname)) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(areaStorageKey(workspaceId), area);
    } catch {
      /* ignore */
    }
  }, [pathname, workspaceId, area]);

  return area;
}

export type AreaMeta = {
  id: Area;
  label: string;
  short: string;
  accent: string;
  description: string;
};

export const AREAS: Record<Area, AreaMeta> = {
  operations: {
    id: "operations",
    label: "Operaciones",
    short: "Ops",
    accent: "#8b5cf6",
    description: "Clientes, contratos, proyectos y carga de trabajo.",
  },
  marketing: {
    id: "marketing",
    label: "Marketing y Ventas",
    short: "Mkt",
    accent: "#ec4899",
    description: "Campañas, contenido, apoyo comercial y producción.",
  },
  finance: {
    id: "finance",
    label: "Finanzas",
    short: "Fin",
    accent: "#10b981",
    description: "Pagos, contratos $$, tipos de cambio y reportes.",
  },
  internal: {
    id: "internal",
    label: "Interno",
    short: "Int",
    accent: "#0ea5e9",
    description: "Reuniones, formación, eventos y procesos internos del equipo.",
  },
};

const storageKey = (wsId: string) => `tasko:space:${wsId}`;

export function useActiveSpace(workspaceId: string | undefined) {
  const perms = usePermissions(workspaceId);
  const canSeeAdmin = perms.hasAny(ADMIN_PERMISSIONS);

  const [space, setSpaceState] = useState<Space>(() => {
    if (typeof window === "undefined" || !workspaceId) return "work";
    try {
      const raw = window.localStorage.getItem(storageKey(workspaceId));
      return raw === "admin" ? "admin" : "work";
    } catch {
      return "work";
    }
  });

  useEffect(() => {
    if (space === "admin" && !perms.isLoading && !canSeeAdmin) {
      setSpaceState("work");
    }
  }, [space, canSeeAdmin, perms.isLoading]);

  const setSpace = (s: Space) => {
    setSpaceState(s);
    if (typeof window !== "undefined" && workspaceId) {
      try {
        window.localStorage.setItem(storageKey(workspaceId), s);
      } catch {
        /* ignore */
      }
    }
  };

  return { space, setSpace, canSeeAdmin, isLoading: perms.isLoading };
}

/** Áreas disponibles según permisos del workspace actual. */
export function useAvailableAreas(opts: { pathname: string; workspaceId: string | undefined }) {
  const { pathname, workspaceId } = opts;
  const perms = usePermissions(workspaceId);

  return useMemo(() => {
    const available: Area[] = ["operations"];
    if (perms.hasAny(MARKETING_PERMISSIONS) || perms.isLoading) {
      available.push("marketing");
    }
    if (perms.hasAny(FINANCE_PERMISSIONS) || perms.isLoading) {
      available.push("finance");
    }
    const active = deriveActiveArea(pathname);
    return { available, active };
  }, [workspaceId, perms, pathname]);
}
