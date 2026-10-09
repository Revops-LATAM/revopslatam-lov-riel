import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSlackChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listSlackChannelsServer } = await import("@/lib/slack/notify.server");
    try {
      const channels = await listSlackChannelsServer();
      return { ok: true as const, channels };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, channels: [] };
    }
  });

export const updateProjectTicketSlack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        formId: z.string().uuid(),
        channelId: z.string().trim().min(1).max(40).nullable(),
        channelName: z.string().trim().min(1).max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      slack_channel_id: data.channelId,
      slack_channel_name: data.channelName,
    };
    const { error } = await context.supabase
      .from("client_ticket_forms")
      .update(patch as never)
      .eq("id", data.formId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testSlackTicketNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ channelId: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { postTicketToSlack } = await import("@/lib/slack/notify.server");
    try {
      await postTicketToSlack({
        channelId: data.channelId,
        ticketId: "00000000-test-test-test-000000000000",
        title: "Ticket de prueba desde RielApp",
        submitterEmail: "prueba@revopslatam.com",
        projectName: "Prueba de integración Slack",
        area: "—",
        requestType: "requerimiento",
        severity: "normal",
        description: "Esta es una notificación de prueba enviada desde la configuración del portal de tickets.",
        ticketUrl: null,
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
