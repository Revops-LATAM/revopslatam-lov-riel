import * as React from "react";
import {
  Body,
  Button,
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
  magic_url?: string;
  project_name?: string;
  expires_in_minutes?: number;
}

const PortalMagicLink = ({
  magic_url = "https://example.com/portal",
  project_name,
  expires_in_minutes = 30,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu acceso al portal de tickets</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Accede a tu portal de tickets</Heading>
        <Text style={p}>
          {project_name
            ? `Toca el botón para entrar al portal de ${project_name} y revisar tus tickets.`
            : "Toca el botón para entrar al portal y revisar tus tickets."}
        </Text>
        <Section style={{ margin: "24px 0" }}>
          <Button href={magic_url} style={btn}>
            Entrar al portal
          </Button>
        </Section>
        <Text style={pSmall}>
          El enlace expira en {expires_in_minutes} minutos y solo funciona una vez. Si no
          solicitaste este acceso, puedes ignorar este correo.
        </Text>
        <Text style={pSmall}>
          Si el botón no funciona, copia este enlace en tu navegador:
          <br />
          <span style={{ wordBreak: "break-all", color: "#334155" }}>{magic_url}</span>
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: PortalMagicLink,
  subject: "Tu acceso al portal de tickets",
  displayName: "Portal cliente · Link de acceso",
  previewData: {
    magic_url: "https://example.com/portal/verify?t=abc",
    project_name: "Proyecto Demo",
    expires_in_minutes: 30,
  },
} satisfies TemplateEntry;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif",
};
const container = { padding: "28px 28px", maxWidth: 560, margin: "0 auto" };
const h1 = { fontSize: 22, color: "#0f172a", margin: "0 0 12px" };
const p = { fontSize: 15, color: "#334155", lineHeight: "22px", margin: "0 0 12px" };
const pSmall = { fontSize: 13, color: "#64748b", lineHeight: "20px", margin: "12px 0 0" };
const btn = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: 8,
  fontSize: 15,
  textDecoration: "none",
  display: "inline-block",
};
