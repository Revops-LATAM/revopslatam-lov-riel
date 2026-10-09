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
  title?: string;
  body?: string;
  url?: string | null;
  actor_name?: string | null;
}

const NotificationGeneric = ({ title = "", body = "", url, actor_name }: Props) => (
  <Html>
    <Head />
    <Preview>{title}</Preview>
    <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "sans-serif", padding: "24px" }}>
      <Container
        style={{ background: "#fff", padding: "32px", borderRadius: "8px", maxWidth: 560 }}
      >
        <Heading style={{ fontSize: 18, margin: "0 0 12px" }}>{title}</Heading>
        {actor_name && (
          <Text style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>De: {actor_name}</Text>
        )}
        {body && (
          <Text style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>{body}</Text>
        )}
        {url && (
          <Section style={{ marginTop: 24 }}>
            <Button
              href={url}
              style={{
                background: "#111",
                color: "#fff",
                padding: "10px 18px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              Abrir en RIEL
            </Button>
          </Section>
        )}
        <Text style={{ fontSize: 11, color: "#999", marginTop: 32 }}>
          Recibiste este correo por tu configuración de notificaciones en RIEL. Cámbialo en Mi
          perfil → Notificaciones.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template: TemplateEntry = {
  component: NotificationGeneric,
  subject: (d: Record<string, any>) => (d.title as string) || "Nueva notificación en RIEL",
  displayName: "Notification (generic)",
  previewData: {
    title: "Te mencionaron",
    body: "Hola @tú, revisa esto",
    url: "https://rielapp.lovable.app",
  },
};
