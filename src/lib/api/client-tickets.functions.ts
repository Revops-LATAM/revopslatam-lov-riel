import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProjectTicketForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: form, error } = await supabase
      .from("client_ticket_forms")
      .select(
        "id, workspace_id, project_id, slug, active, form_schema, tickets_phase_id, created_at, slack_channel_id, slack_channel_name",
      )
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Project SLA override + workspace SLAs (for the selector)
    const { data: project } = await supabase
      .from("projects")
      .select("id, workspace_id, contract_id, sla_id, contract:contracts(sla_id, name)")
      .eq("id", data.projectId)
      .maybeSingle();
    type ProjectRow = {
      sla_id: string | null;
      contract: { sla_id: string | null; name: string | null } | null;
      workspace_id: string;
    } | null;
    const proj = project as unknown as ProjectRow;

    let slas: Array<{ id: string; name: string; active: boolean }> = [];
    if (proj?.workspace_id) {
      const { data: slasRows } = await supabase
        .from("slas")
        .select("id, name, active")
        .eq("workspace_id", proj.workspace_id)
        .order("is_system", { ascending: false })
        .order("name");
      slas = slasRows ?? [];
    }

    if (!form) {
      return {
        form: null,
        project_sla_id: proj?.sla_id ?? null,
        contract_sla_id: proj?.contract?.sla_id ?? null,
        contract_name: proj?.contract?.name ?? null,
        workspace_slas: slas,
      };
    }
    const { data: emails, error: eErr } = await supabase
      .from("client_ticket_authorized_emails")
      .select("id, email, created_at, portal_role")
      .eq("form_id", form.id)
      .order("email");
    if (eErr) throw new Error(eErr.message);
    return {
      form: { ...form, authorized_emails: emails ?? [] },
      project_sla_id: proj?.sla_id ?? null,
      contract_sla_id: proj?.contract?.sla_id ?? null,
      contract_name: proj?.contract?.name ?? null,
      workspace_slas: slas,
    };
  });

export const ensureProjectTicketForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: formId, error } = await supabase.rpc("ensure_client_ticket_form", {
      _project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { formId };
  });

export const updateProjectTicketForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        formId: z.string().uuid(),
        active: z.boolean().optional(),
        formSchema: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    type Patch = { active?: boolean; form_schema?: unknown };
    const patch: Patch = {};
    if (data.active !== undefined) patch.active = data.active;
    if (data.formSchema !== undefined) patch.form_schema = data.formSchema;
    const { error } = await supabase
      .from("client_ticket_forms")
      .update(patch as never)
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProjectTicketAreas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        formId: z.string().uuid(),
        areas: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur, error: rErr } = await supabase
      .from("client_ticket_forms")
      .select("form_schema")
      .eq("id", data.formId)
      .single();
    if (rErr) throw new Error(rErr.message);
    const schema = (cur?.form_schema as Record<string, unknown>) ?? {};
    schema.areas = data.areas;
    const { error } = await supabase
      .from("client_ticket_forms")
      .update({ form_schema: schema } as never)
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const FieldCfgSchema = z.object({
  label: z.string().trim().min(1).max(80),
  required: z.boolean(),
});
const FieldsSchema = z.object({
  title: FieldCfgSchema,
  request_type: FieldCfgSchema,
  area: FieldCfgSchema,
  severity: FieldCfgSchema,
  description: FieldCfgSchema,
});

export const updateProjectTicketFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        formId: z.string().uuid(),
        fields: FieldsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur, error: rErr } = await supabase
      .from("client_ticket_forms")
      .select("form_schema")
      .eq("id", data.formId)
      .single();
    if (rErr) throw new Error(rErr.message);
    const schema = (cur?.form_schema as Record<string, unknown>) ?? {};
    schema.fields = data.fields;
    const { error } = await supabase
      .from("client_ticket_forms")
      .update({ form_schema: schema } as never)
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProjectSlaOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        slaId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("projects")
      .update({ sla_id: data.slaId } as never)
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addAuthorizedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        formId: z.string().uuid(),
        email: z.string().email().max(255),
        portalRole: z.enum(["member", "leader"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("client_ticket_authorized_emails").insert({
      form_id: data.formId,
      email: data.email.toLowerCase().trim(),
      portal_role: data.portalRole ?? "member",
    } as never);
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const removeAuthorizedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ emailId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("client_ticket_authorized_emails")
      .delete()
      .eq("id", data.emailId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAuthorizedEmailRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        emailId: z.string().uuid(),
        portalRole: z.enum(["member", "leader"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("client_ticket_authorized_emails")
      .update({ portal_role: data.portalRole } as never)
      .eq("id", data.emailId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
