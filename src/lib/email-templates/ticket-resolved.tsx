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
  resolution_note?: string;
}

const TicketResolved = ({ ticket_id = "00000000", title = "", resolution_note }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu ticket #{ticket_id.slice(0, 8)} fue resuelto</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tu ticket fue resuelto</Heading>
        <Text style={p}>Hemos marcado como resuelto el ticket:</Text>
        <Section style={box}>
          <Text style={mono}>#{ticket_id.slice(0, 8)}</Text>
          <Text style={value}>{title}</Text>
        </Section>
        {resolution_note && (
          <>
            <Text style={label}>Notas</Text>
            <Text style={value}>{resolution_note}</Text>
          </>
        )}
        <Text style={p}>
          Si la solución no resolvió tu problema, responde a este email o envía un nuevo ticket.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: TicketResolved,
  subject: (d: Record<string, unknown>) =>
    `Ticket resuelto #${String(d.ticket_id ?? "").slice(0, 8)} — ${String(d.title ?? "")}`,
  displayName: "Ticket resuelto",
  previewData: {
    ticket_id: "abc12345-xxxx",
    title: "No carga la página de checkout",
    resolution_note: "Restauramos el endpoint del proveedor de pago.",
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#111111",
};
const container = { padding: "24px", maxWidth: "560px", margin: "0 auto" };
const h1 = { fontSize: "20px", fontWeight: 600, margin: "0 0 12px" };
const p = { fontSize: "14px", lineHeight: "22px", margin: "8px 0" };
const box = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "12px 0",
};
const label = {
  fontSize: "11px",
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.4px",
  margin: "8px 0 2px",
};
const value = { fontSize: "14px", margin: "0 0 4px", whiteSpace: "pre-wrap" as const };
const mono = { fontSize: "14px", fontFamily: "monospace", margin: "0 0 4px" };
