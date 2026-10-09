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
  project_name?: string;
  request_type?: string;
  severity?: string;
  description?: string;
  target_response_at?: string | null;
  target_resolution_at?: string | null;
}

const fmt = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${date} ${time}`;
  } catch {
    return null;
  }
};

const TicketReceived = ({
  ticket_id = "00000000",
  title = "",
  project_name,
  request_type = "requerimiento",
  severity = "normal",
  description = "",
  target_response_at,
  target_resolution_at,
}: Props) => {
  const respondBy = fmt(target_response_at);
  const resolveBy = fmt(target_resolution_at);
  const sev =
    severity === "urgente_critico"
      ? request_type === "incidencia"
        ? "Crítico"
        : "Urgente"
      : "Normal";
  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>Recibimos tu ticket #{ticket_id.slice(0, 8)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Recibimos tu ticket</Heading>
          <Text style={p}>Gracias por tu solicitud. La estamos revisando.</Text>
          <Section style={box}>
            <Text style={label}>ID</Text>
            <Text style={mono}>{ticket_id.slice(0, 8)}</Text>
            <Text style={label}>Título</Text>
            <Text style={value}>{title}</Text>
            {project_name && (
              <>
                <Text style={label}>Proyecto</Text>
                <Text style={value}>{project_name}</Text>
              </>
            )}
            <Text style={label}>Tipo · Nivel</Text>
            <Text style={value}>
              {request_type === "incidencia" ? "Incidencia" : "Requerimiento"} · {sev}
            </Text>
            {description && (
              <>
                <Text style={label}>Descripción</Text>
                <Text style={value}>{description}</Text>
              </>
            )}
          </Section>
          {(respondBy || resolveBy) && (
            <Section style={slaBox}>
              {respondBy && (
                <Text style={p}>
                  <strong>Primera respuesta:</strong> {respondBy}
                </Text>
              )}
              {resolveBy && (
                <Text style={p}>
                  <strong>Resolución estimada:</strong> {resolveBy}
                </Text>
              )}
            </Section>
          )}
          <Text style={p}>Te avisaremos por email cuando haya actualizaciones.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TicketReceived,
  subject: (d: Record<string, unknown>) =>
    `Ticket recibido #${String(d.ticket_id ?? "").slice(0, 8)} — ${String(d.title ?? "")}`,
  displayName: "Ticket recibido",
  previewData: {
    ticket_id: "abc12345-xxxx",
    title: "No carga la página de checkout",
    project_name: "Sitio principal",
    request_type: "incidencia",
    severity: "urgente_critico",
    description: "Al hacer click en pagar la página queda en blanco.",
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
const slaBox = {
  backgroundColor: "#eff6ff",
  borderRadius: "8px",
  padding: "12px 16px",
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
