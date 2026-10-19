import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entityInput = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  rut: z.string().max(20).nullable().optional(),
  razon_social: z.string().min(1).max(200),
  giro: z.string().max(300).nullable().optional(),
  direccion: z.string().max(300).nullable().optional(),
  comuna: z.string().max(120).nullable().optional(),
  email_facturacion: z.string().email().nullable().optional().or(z.literal("")),
  cc_emails: z.array(z.string().email()).max(20).default([]),
  is_primary: z.boolean().default(false),
});

export const listBillingEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ accountId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("account_billing_entities")
      .select("*")
      .eq("account_id", data.accountId)
      .eq("activo", true)
      .order("is_primary", { ascending: false })
      .order("orden")
      .order("razon_social");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertBillingEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => entityInput.parse(i))
  .handler(async ({ data, context }) => {
    const payload = {
      account_id: data.accountId,
      rut: data.rut || null,
      razon_social: data.razon_social.trim(),
      giro: data.giro || null,
      direccion: data.direccion || null,
      comuna: data.comuna || null,
      email_facturacion: data.email_facturacion || null,
      cc_emails: data.cc_emails,
      is_primary: data.is_primary,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("account_billing_entities")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("account_billing_entities")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const archiveBillingEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("account_billing_entities")
      .update({ activo: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getContractSplits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ contractId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contract_billing_splits")
      .select("billing_entity_id, monto, orden")
      .eq("contract_id", data.contractId)
      .order("orden");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, monto: Number(r.monto) }));
  });

export const saveContractSplits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z
      .object({
        contractId: z.string().uuid(),
        splits: z
          .array(z.object({ billingEntityId: z.string().uuid(), monto: z.number().min(0) }))
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { error: derr } = await sb
      .from("contract_billing_splits")
      .delete()
      .eq("contract_id", data.contractId);
    if (derr) throw new Error(derr.message);
    const rows = data.splits
      .filter((s) => s.monto > 0)
      .map((s, i) => ({
        contract_id: data.contractId,
        billing_entity_id: s.billingEntityId,
        monto: s.monto,
        orden: i,
      }));
    if (rows.length > 0) {
      const { error } = await sb.from("contract_billing_splits").insert(rows);
      if (error) throw new Error(error.message);
    }
    const { data: n, error: rerr } = await sb.rpc("apply_contract_billing_splits", {
      _contract_id: data.contractId,
    });
    if (rerr) throw new Error(rerr.message);
    return { splitPayments: n ?? 0 };
  });
