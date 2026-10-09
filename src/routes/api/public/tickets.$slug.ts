import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { computeSlaTargets } from "@/lib/sla";

const PayloadSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase().trim()),
  title: z.string().trim().min(2).max(200),
  request_type: z.enum(["incidencia", "requerimiento"]),
  area: z.string().trim().min(1).max(60),
  severity: z.enum(["normal", "urgente_critico"]),
  description: z.string().trim().min(2).max(5000),
});

const EmailCheckSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase().trim()),
});

export const Route = createFileRoute("/api/public/tickets/$slug")({
  server: {
    handlers: {
      // Public read of form schema (areas + field labels/required).
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("active, form_schema")
          .eq("slug", params.slug)
          .maybeSingle();
        if (!form || !form.active) {
          return Response.json({ error: "Formulario no disponible." }, { status: 404 });
        }
        return Response.json({ schema: form.form_schema ?? {} });
      },
      // Email validation (intent=check) and submission share the route.
      POST: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        const intent = url.searchParams.get("intent");
        const slug = params.slug;

        const { data: form, error: fErr } = await supabaseAdmin
          .from("client_ticket_forms")
          .select("id, project_id, workspace_id, tickets_phase_id, active, slack_channel_id")
          .eq("slug", slug)
          .maybeSingle();
        if (fErr || !form || !form.active) {
          return Response.json({ error: "Formulario no disponible." }, { status: 404 });
        }

        // Safety net: if the form was created without a tickets inbox phase,
        // find/create it now so submissions don't end up orphaned (invisible in the project tree).
        if (!form.tickets_phase_id) {
          const { data: existingPhase } = await supabaseAdmin
            .from("phases")
            .select("id")
            .eq("project_id", form.project_id)
            .eq("is_ticket_inbox", true)
            .maybeSingle();
          let phaseId = existingPhase?.id ?? null;
          if (!phaseId) {
            const { data: maxRow } = await supabaseAdmin
              .from("phases")
              .select("order_index")
              .eq("project_id", form.project_id)
              .order("order_index", { ascending: false })
              .limit(1)
              .maybeSingle();
            const { data: created, error: pErr } = await supabaseAdmin
              .from("phases")
              .insert({
                project_id: form.project_id,
                name: "Tickets",
                order_index: (maxRow?.order_index ?? 0) + 1,
                is_ticket_inbox: true,
              } as never)
              .select("id")
              .single();
            if (pErr || !created) {
              return Response.json({ error: "No se pudo inicializar la bandeja de tickets." }, { status: 500 });
            }
            phaseId = created.id;
          }
          await supabaseAdmin
            .from("client_ticket_forms")
            .update({ tickets_phase_id: phaseId })
            .eq("id", form.id);
          form.tickets_phase_id = phaseId;
        }

        const contentType = request.headers.get("content-type") ?? "";
        const isMultipart = contentType.includes("multipart/form-data");

        // Parse body once (JSON for check + JSON submit; FormData for multipart submit).
        let jsonBody: Record<string, unknown> = {};
        let files: File[] = [];
        let multipartRaw: Record<string, string> | null = null;
        if (isMultipart) {
          const fd = await request.formData();
          multipartRaw = {
            email: String(fd.get("email") ?? ""),
            title: String(fd.get("title") ?? ""),
            request_type: String(fd.get("request_type") ?? ""),
            area: String(fd.get("area") ?? ""),
            severity: String(fd.get("severity") ?? ""),
            description: String(fd.get("description") ?? ""),
          };
          files = fd
            .getAll("files")
            .filter((f): f is File => f instanceof File && f.size > 0)
            .slice(0, 3);
          const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
          if (tooBig) {
            return Response.json(
              { error: `El archivo "${tooBig.name}" supera 10MB.` },
              { status: 400 },
            );
          }
        } else {
          jsonBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        }

        if (intent === "check") {
          const parsed = EmailCheckSchema.safeParse(jsonBody);
          if (!parsed.success) return Response.json({ error: "Email inválido" }, { status: 400 });
          const { data: allowed } = await supabaseAdmin
            .from("client_ticket_authorized_emails")
            .select("id")
            .eq("form_id", form.id)
            .eq("email", parsed.data.email)
            .maybeSingle();
          if (!allowed) {
            return Response.json({ ok: false }, { status: 200 });
          }
          return Response.json({ ok: true }, { status: 200 });
        }

        const parsed = PayloadSchema.safeParse(multipartRaw ?? jsonBody);
        if (!parsed.success) {
          return Response.json(
            { error: "Datos inválidos", details: parsed.error.flatten() },
            { status: 400 },
          );
        }
        const data = parsed.data;



        // Re-validate email is authorized
        const { data: allowed } = await supabaseAdmin
          .from("client_ticket_authorized_emails")
          .select("id")
          .eq("form_id", form.id)
          .eq("email", data.email)
          .maybeSingle();
        if (!allowed) {
          return Response.json({ error: "No autorizado" }, { status: 403 });
        }

        // Rate limit: max 10 submissions per email per hour
        const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count: recent } = await supabaseAdmin
          .from("client_ticket_submissions")
          .select("id", { count: "exact", head: true })
          .eq("form_id", form.id)
          .eq("submitter_email", data.email)
          .gte("created_at", oneHourAgo);
        if ((recent ?? 0) >= 10) {
          return Response.json(
            { error: "Demasiados envíos. Intenta nuevamente más tarde." },
            { status: 429 },
          );
        }

        // Resolve project's contract + effective SLA (project override beats contract default)
        const { data: project } = await supabaseAdmin
          .from("projects")
          .select("id, contract_id, area, sla_id")
          .eq("id", form.project_id)
          .single();
        if (!project) {
          return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
        }

        let sla_target_response_at: string | null = null;
        let sla_target_resolution_at: string | null = null;
        let effectiveSlaId: string | null = (project as { sla_id?: string | null }).sla_id ?? null;
        if (!effectiveSlaId && project.contract_id) {
          const { data: contract } = await supabaseAdmin
            .from("contracts")
            .select("sla_id")
            .eq("id", project.contract_id)
            .single();
          effectiveSlaId = contract?.sla_id ?? null;
        }
        if (effectiveSlaId) {
          const { data: targets } = await supabaseAdmin
            .from("sla_targets")
            .select("ticket_type, level, target_minutes, response_target_minutes, business_hours")
            .eq("sla_id", effectiveSlaId);
          const t = (targets ?? []).find(
            (x) => x.ticket_type === data.request_type && x.level === data.severity,
          ) as
            | {
                target_minutes: number;
                response_target_minutes: number | null;
                business_hours: boolean;
              }
            | undefined;
          if (t) {
            const todayIso = new Date().toISOString().slice(0, 10);
            const horizonIso = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);
            const { data: holRows } = await supabaseAdmin
              .from("workspace_holidays")
              .select("date")
              .eq("workspace_id", form.workspace_id)
              .eq("affects", "all")
              .gte("date", todayIso)
              .lte("date", horizonIso);
            const holidays = new Set<string>((holRows ?? []).map((h: { date: string }) => h.date));
            const responseMins =
              t.response_target_minutes ?? Math.max(15, Math.round(t.target_minutes / 4));
            const r = computeSlaTargets(
              new Date().toISOString(),
              responseMins,
              t.target_minutes,
              t.business_hours,
              holidays,
            );
            sla_target_response_at = r.response;
            sla_target_resolution_at = r.resolution;
          }
        }

        // Find ticket task type + default status for workspace
        const { data: ticketType } = await supabaseAdmin
          .from("task_types")
          .select("id")
          .eq("workspace_id", form.workspace_id)
          .eq("key", "ticket")
          .maybeSingle();
        if (!ticketType) {
          return Response.json({ error: "Configuración de tickets incompleta." }, { status: 500 });
        }
        const { data: status } = await supabaseAdmin
          .from("task_statuses")
          .select("id")
          .eq("task_type_id", ticketType.id)
          .eq("category", "abierta")
          .order("is_default", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();

        const priority = data.severity === "urgente_critico" ? "high" : "medium";

        const insertPayload = {
          project_id: form.project_id,
          contract_id: project.contract_id,
          phase_id: form.tickets_phase_id,
          task_type_id: ticketType.id,
          status_id: status?.id ?? undefined,
          title: data.title,
          description: data.description,
          priority,
          submitter_email: data.email,
          request_type: data.request_type,
          severity: data.severity,
          sla_target_response_at,
          sla_target_resolution_at,
        };
        const { data: task, error: tErr } = await supabaseAdmin
          .from("tasks")
          .insert(insertPayload as never)
          .select("id")
          .single();
        if (tErr || !task) {
          return Response.json({ error: tErr?.message ?? "No se pudo crear el ticket." }, { status: 500 });
        }
        // Prepend short ticket ID to title for identification
        const shortId = String(task.id).slice(0, 8);
        const titledName = `#${shortId} · ${data.title}`;
        await supabaseAdmin
          .from("tasks")
          .update({ title: titledName })
          .eq("id", task.id);

        await supabaseAdmin.from("client_ticket_submissions").insert({
          form_id: form.id,
          task_id: task.id,
          submitter_email: data.email,
          payload: JSON.parse(JSON.stringify(data)),
        });

        // Upload optional attachments
        if (files.length > 0) {
          const attachmentRows: Array<{
            task_id: string;
            file_path: string;
            file_name: string;
            size: number;
            mime_type: string | null;
          }> = [];
          for (const file of files) {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
            const objectPath = `tickets/${task.id}/${crypto.randomUUID()}-${safe}`;
            const buf = new Uint8Array(await file.arrayBuffer());
            const { error: upErr } = await supabaseAdmin.storage
              .from("task-attachments")
              .upload(objectPath, buf, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
              });
            if (upErr) {
              console.error("[tickets] attachment upload failed", upErr);
              continue;
            }
            attachmentRows.push({
              task_id: task.id,
              file_path: objectPath,
              file_name: file.name,
              size: file.size,
              mime_type: file.type || null,
            });
          }
          if (attachmentRows.length > 0) {
            const { error: attErr } = await supabaseAdmin
              .from("task_attachments")
              .insert(attachmentRows as never);
            if (attErr) console.error("[tickets] attachment row insert failed", attErr);
          }
        }


        const { data: projectInfo } = await supabaseAdmin
          .from("projects")
          .select("name")
          .eq("id", form.project_id)
          .maybeSingle();

        try {
          const { enqueueTransactionalEmailServer } = await import(
            "@/lib/email/enqueue.server"
          );
          await enqueueTransactionalEmailServer({
            templateName: "ticket-received",
            to: data.email,
            idempotencyKey: `ticket-received-${task.id}`,
            templateData: {
              ticket_id: task.id,
              title: data.title,
              project_name: projectInfo?.name,
              request_type: data.request_type,
              severity: data.severity,
              description: data.description,
              target_response_at: sla_target_response_at,
              target_resolution_at: sla_target_resolution_at,
            },
          });
        } catch (e) {
          console.error("[tickets] failed to enqueue confirmation email", e);
        }

        // Slack notification (best-effort, never blocks the response).
        const slackChannelId = (form as { slack_channel_id?: string | null }).slack_channel_id;
        if (slackChannelId) {
          try {
            const { postTicketToSlack } = await import("@/lib/slack/notify.server");
            const appBase = process.env.PUBLIC_APP_URL || "https://riel.revopslatam.com";
            await postTicketToSlack({
              channelId: slackChannelId,
              ticketId: task.id,
              title: data.title,
              submitterEmail: data.email,
              projectName: projectInfo?.name,
              area: data.area,
              requestType: data.request_type,
              severity: data.severity,
              description: data.description,
              ticketUrl: `${appBase}/tasks/${task.id}`,
            });

          } catch (e) {
            console.error("[tickets] slack notification failed", e);
          }
        }

        return Response.json({ ok: true, ticketId: task.id });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: { "Access-Control-Allow-Methods": "POST, OPTIONS" },
        }),
    },
  },
});
