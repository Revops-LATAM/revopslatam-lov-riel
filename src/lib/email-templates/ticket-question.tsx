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
  question?: string;
  author_name?: string;
}

const TicketQuestion = ({
  ticket_id = "00000000",
  title = "",
  question = "",
  author_name,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tenemos una pregunta sobre tu ticket #{ticket_id.slice(0, 8)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tenemos una pregunta</Heading>
        <Text style={p}>
          {author_name ? `${author_name} dejó` : "Dejamos"} un mensaje en tu ticket:
        </Text>
        <Section style={box}>
          <Text style={mono}>#{ticket_id.slice(0, 8)}</Text>
          <Text style={value}>{title}</Text>
        </Section>
        <Section style={quote}>
          <Text style={value}>{question}</Text>
        </Section>
        <Text style={p}>Responde a este email para que podamos avanzar.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: TicketQuestion,
  subject: (d: Record<string, unknown>) =>
    `Pregunta sobre tu ticket #${String(d.ticket_id ?? "").slice(0, 8)}`,
  displayName: "Ticket — pregunta",
  previewData: {
    ticket_id: "abc12345-xxxx",
    title: "No carga la página de checkout",
    question: "¿En qué navegador y a qué hora ocurrió?",
    author_name: "Soporte",
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
const quote = {
  borderLeft: "3px solid #3b82f6",
  backgroundColor: "#eff6ff",
  padding: "10px 14px",
  margin: "12px 0",
};
const value = { fontSize: "14px", margin: "0 0 4px", whiteSpace: "pre-wrap" as const };
const mono = { fontSize: "14px", fontFamily: "monospace", margin: "0 0 4px" };
