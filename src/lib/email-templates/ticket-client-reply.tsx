import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  ticket_id?: string;
  title?: string;
  client_email?: string;
  message?: string;
  ticket_url?: string;
}

const TicketClientReply = ({
  ticket_id = "00000000",
  title = "",
  client_email = "",
  message = "",
  ticket_url,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Nueva respuesta del cliente en #{ticket_id.slice(0, 8)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nueva respuesta del cliente</Heading>
        <Text style={p}>
          <strong>{client_email}</strong> respondió en el ticket{" "}
          <span style={mono}>#{ticket_id.slice(0, 8)}</span>
          {title ? ` · ${title}` : ""}.
        </Text>
        <Section style={box}>
          <Text style={quote}>{message}</Text>
        </Section>
        {ticket_url && (
          <Text style={p}>
            <a href={ticket_url} style={link}>
              Abrir ticket en Riel →
            </a>
          </Text>
        )}
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: TicketClientReply,
  subject: (d) => `Respuesta del cliente · #${String(d.ticket_id ?? "").slice(0, 8)}`,
  displayName: "Ticket · Respuesta del cliente",
  previewData: {
    ticket_id: "abcd1234-...",
    title: "Consulta sobre facturación",
    client_email: "cliente@empresa.cl",
    message: "Hola, necesito más información sobre el estado…",
    ticket_url: "https://riel.revopslatam.com/w/-/projects/xxx?task=abcd",
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif",
};
const container = { padding: "28px 28px", maxWidth: 640, margin: "0 auto" };
const h1 = { fontSize: 20, color: "#0f172a", margin: "0 0 12px" };
const p = { fontSize: 15, color: "#334155", lineHeight: "22px", margin: "0 0 12px" };
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#0f172a" };
const box = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "14px 16px",
  background: "#f8fafc",
  margin: "12px 0 16px",
};
const quote = { whiteSpace: "pre-wrap" as const, fontSize: 14, color: "#0f172a", margin: 0 };
const link = { color: "#0f172a", textDecoration: "underline" };
