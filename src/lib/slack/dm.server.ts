/**
 * Slack DM helpers for internal notifications.
 * Uses the shared Slack connector (bot token via gateway).
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

async function slackApi(method: string, init: RequestInit = {}) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const slackKey = process.env.SLACK_API_KEY;
  if (!lovableKey || !slackKey) throw new Error("Slack no está configurado");
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  const data = JSON.parse(body);
  if (!res.ok || !data.ok) throw new Error(`Slack ${method}: ${data.error ?? res.status}`);
  return data;
}

const emailToSlackIdCache = new Map<string, string | null>();

export async function resolveSlackUserId(email: string): Promise<string | null> {
  const key = email.toLowerCase();
  if (emailToSlackIdCache.has(key)) return emailToSlackIdCache.get(key) ?? null;
  try {
    const data = await slackApi(`users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      method: "POST",
    });
    const id = data.user?.id ?? null;
    emailToSlackIdCache.set(key, id);
    return id;
  } catch {
    emailToSlackIdCache.set(key, null);
    return null;
  }
}

export async function sendSlackDM(userId: string, text: string, url?: string | null) {
  // Open a DM channel then post
  const im = await slackApi("conversations.open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  });
  const channel = im.channel?.id;
  if (!channel) throw new Error("No se pudo abrir DM en Slack");

  const blocks: any[] = [
    { type: "section", text: { type: "mrkdwn", text } },
  ];
  if (url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir en RIEL" },
          url,
        },
      ],
    });
  }

  await slackApi("chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text, blocks }),
  });
}
