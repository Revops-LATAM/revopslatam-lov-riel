import { z } from "zod";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";

export const taskStatusSchema = z.enum([
  "nueva",
  "planificada",
  "en_curso",
  "en_pausa",
  "revision_interna",
  "revision_cliente",
  "en_correccion",
  "demorada",
  "completada",
  "cancelada",
]);

export const taskPrioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);

export const workspaceRoleSchema = z.enum(["owner", "admin", "super_admin", "member", "guest"]);
