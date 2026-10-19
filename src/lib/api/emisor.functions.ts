import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getEmisor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_emisor")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertEmisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        rut: z.string().max(20).nullable().optional(),
        razon_social: z.string().max(255).nullable().optional(),
        giro: z.string().max(255).nullable().optional(),
        direccion: z.string().max(500).nullable().optional(),
        comuna: z.string().max(120).nullable().optional(),
        acteco: z.number().int().nullable().optional(),
        email_contacto: z.string().email().nullable().optional().or(z.literal("")),
        telefono: z.string().max(50).nullable().optional(),
        banco: z.string().max(120).nullable().optional(),
        tipo_cuenta: z.string().max(60).nullable().optional(),
        numero_cuenta: z.string().max(60).nullable().optional(),
        email_finanzas: z.string().email().nullable().optional().or(z.literal("")),
        cobranza_dias_recordatorio: z.number().int().min(1).max(90).optional(),
        cobranza_cc_emails: z.array(z.string().email()).max(10).optional(),
        cobranza_activa: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId, ...rest } = data;
    const payload = {
      workspace_id: workspaceId,
      ...rest,
      email_contacto: rest.email_contacto === "" ? null : rest.email_contacto,
      email_finanzas: rest.email_finanzas === "" ? null : rest.email_finanzas,
    };
    const { error } = await context.supabase
      .from("workspace_emisor")
      .upsert(payload as never, { onConflict: "workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
