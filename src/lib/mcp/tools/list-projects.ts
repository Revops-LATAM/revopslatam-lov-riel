import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sbForUser, notAuthed, ok, fail } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "List Riel projects in a workspace, with client, area, state and budgeted hours. Filter by text or state.",
  inputSchema: {
    workspaceId: z.string().uuid().describe("Workspace id (use list_workspaces first)."),
    search: z.string().optional().describe("Case-insensitive match on project or client name."),
    includeArchived: z.boolean().optional().describe("Include archived projects (default false)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspaceId, search, includeArchived, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = sbForUser(ctx)
      .from("projects")
      .select(
        "id, name, client_name, area, state, delivery_type, horas_presupuestadas_total, fecha_inicio_delivery, fecha_entrega_objetivo, archived",
      )
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true })
      .limit(limit ?? 100);
    if (!includeArchived) q = q.eq("archived", false);
    if (search) q = q.or(`name.ilike.%${search}%,client_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ projects: data ?? [] });
  },
});
