import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmailServer } from "@/lib/email/transactional.server";
import { resolveSlackUserId, sendSlackDM } from "@/lib/slack/dm.server";

const APP_BASE_URL = "https://riel.revopslatam.com";

interface ChannelsSent {
  email?: boolean;
  slack?: boolean;
  desktop?: boolean;
  in_app?: boolean;
}

export const Route = createFileRoute("/api/public/cron/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey");
        const auth = request.headers.get("Authorization");
        const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
        if (!anonKey || (apikey !== anonKey && bearer !== anonKey)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) return new Response("Missing service key", { status: 500 });
        const admin = createClient(process.env.SUPABASE_URL!, serviceKey);

        // Pull recent unprocessed notifications (last 24h, limit 200)
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: notes, error } = await admin
          .from("notifications")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(200);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let emailSent = 0;
        let slackSent = 0;
        let skipped = 0;

        for (const n of notes ?? []) {
          const sent = (n.channels_sent as ChannelsSent) ?? {};
          if (sent.email && sent.slack) {
            skipped++;
            continue;
          }

          // Resolve channels for this user + kind
          const { data: chRows } = await admin.rpc("get_notification_channels", {
            _kind: n.kind,
            _user_id: n.user_id,
          });
          const ch = chRows?.[0] ?? { email: false, slack: false, desktop: true, in_app: true };

          // Fetch recipient profile (email + slack_user_id)
          const { data: profile } = await admin
            .from("profiles")
            .select("email, full_name, slack_user_id")
            .eq("id", n.user_id)
            .maybeSingle();

          const url = n.url ? (n.url.startsWith("http") ? n.url : `${APP_BASE_URL}${n.url}`) : null;

          // EMAIL
          if (ch.email && !sent.email && profile?.email) {
            try {
              await sendTransactionalEmailServer({
                templateName: "notification-generic",
                to: profile.email,
                templateData: {
                  title: n.title,
                  body: n.body ?? "",
                  url,
                  actor_name: null,
                },
                idempotencyKey: `notif:${n.id}:email`,
              });
              sent.email = true;
              emailSent++;
            } catch (e) {
              console.error("[dispatch-notifications] email failed", n.id, e);
            }
          }

          // SLACK DM
          if (ch.slack && !sent.slack) {
            try {
              let slackId = profile?.slack_user_id ?? null;
              if (!slackId && profile?.email) {
                slackId = await resolveSlackUserId(profile.email);
              }
              if (slackId) {
                const text = `*${n.title}*${n.body ? `\n${n.body}` : ""}`;
                await sendSlackDM(slackId, text, url);
                sent.slack = true;
                slackSent++;
              }
            } catch (e) {
              console.error("[dispatch-notifications] slack failed", n.id, e);
            }
          }

          // Persist channels_sent
          if (sent.email || sent.slack) {
            await admin.from("notifications").update({ channels_sent: sent }).eq("id", n.id);
          }
        }

        return Response.json({
          processed: notes?.length ?? 0,
          emailSent,
          slackSent,
          skipped,
        });
      },
    },
  },
});
