import { supabase } from "@/integrations/supabase/client";

export interface SendTransactionalArgs {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, unknown>;
}

export async function sendTransactionalEmail(args: SendTransactionalArgs) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("No active session");
  const resp = await fetch("/lovable/email/transactional/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.error) {
    throw new Error(json?.error ?? `Failed to send (${resp.status})`);
  }
  return json;
}
