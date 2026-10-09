const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
}

async function slackCall(method: string, init: RequestInit = {}): Promise<any> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const slackKey = process.env.SLACK_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY no está configurada");
  if (!slackKey) throw new Error("Conexión de Slack no está vinculada al proyecto");

  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Slack ${method}: respuesta inválida (HTTP ${res.status})`);
  }
  if (!res.ok || !data.ok) {
    throw new Error(`Slack ${method}: ${data.error ?? `HTTP ${res.status}`}`);
  }
  return data;
}

export async function listSlackChannelsServer(): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = "";
  do {
    const qs = new URLSearchParams({
      limit: "200",
      exclude_archived: "true",
      types: "public_channel,private_channel",
    });
    if (cursor) qs.set("cursor", cursor);
    const data = await slackCall(`conversations.list?${qs.toString()}`, {
      method: "POST",
    });
    for (const c of data.channels ?? []) {
      channels.push({
        id: c.id,
        name: c.name,
        is_private: !!c.is_private,
        is_archived: !!c.is_archived,
      });
    }
    cursor = data.response_metadata?.next_cursor ?? "";
  } while (cursor);
  channels.sort((a, b) => a.name.localeCompare(b.name));
  return channels;
}

export interface TicketSlackPayload {
  channelId: string;
  ticketId: string;
  title: string;
  submitterEmail: string;
  projectName?: string | null;
  area?: string | null;
  requestType: string;
  severity: string;
  description: string;
  ticketUrl?: string | null;
}

export async function postTicketToSlack(p: TicketSlackPayload): Promise<void> {
  const emoji =
    p.severity === "urgente_critico"
      ? p.requestType === "incidencia"
        ? ":rotating_light:"
        : ":zap:"
      : ":ticket:";
  const header = `${emoji} Nuevo ticket · ${p.requestType === "incidencia" ? "Incidencia" : "Requerimiento"} · ${
    p.severity === "urgente_critico"
      ? p.requestType === "incidencia"
        ? "Crítico"
        : "Urgente"
      : "Normal"
  }`;

  const descriptionShort =
    p.description.length > 500 ? `${p.description.slice(0, 500)}…` : p.description;

  const fields: Array<{ type: string; text: string }> = [
    { type: "mrkdwn", text: `*Proyecto:*\n${p.projectName ?? "—"}` },
    { type: "mrkdwn", text: `*Área:*\n${p.area ?? "—"}` },
    { type: "mrkdwn", text: `*Solicitante:*\n${p.submitterEmail}` },
    { type: "mrkdwn", text: `*Ticket:*\n\`${p.ticketId.slice(0, 8)}\`` },
  ];

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: header, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${p.title}*` } },
    { type: "section", fields },
    { type: "section", text: { type: "mrkdwn", text: `>>> ${descriptionShort}` } },
  ];
  if (p.ticketUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir ticket", emoji: true },
          url: p.ticketUrl,
          style: "primary",
        },
      ],
    });
  }

  try {
    await slackCall("chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: p.channelId,
        text: `${header} — ${p.title}`,
        blocks,
      }),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("not_in_channel") || msg.includes("channel_not_found")) {
      throw new Error(
        "El bot de Slack no está en el canal. Invítalo con `/invite @Lovable App` desde el canal y vuelve a intentar.",
      );
    }
    throw e;
  }
}


export interface TicketReplySlackPayload {
  channelId: string;
  ticketId: string;
  title: string;
  clientEmail: string;
  message: string;
  ticketUrl?: string | null;
}

export async function postTicketReplyToSlack(p: TicketReplySlackPayload): Promise<void> {
  const header = `:speech_balloon: Respuesta del cliente · #${p.ticketId.slice(0, 8)}`;
  const short = p.message.length > 500 ? `${p.message.slice(0, 500)}…` : p.message;
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: header, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${p.title}*\n_de ${p.clientEmail}_` } },
    { type: "section", text: { type: "mrkdwn", text: `>>> ${short}` } },
  ];
  if (p.ticketUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir ticket", emoji: true },
          url: p.ticketUrl,
        },
      ],
    });
  }
  try {
    await slackCall("chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: p.channelId, text: `${header} — ${p.title}`, blocks }),
    });
  } catch (e) {
    console.error("[slack] reply post failed", e);
  }
}
