import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  folio?: string | number
  monto_formatted?: string
  dias_vencido?: number
  fecha_vencimiento?: string
  pdf_url?: string
  emisor_nombre?: string
  emisor_email?: string
}

const InvoiceReminder = ({
  folio = '—',
  monto_formatted = '$0',
  dias_vencido = 0,
  fecha_vencimiento,
  pdf_url,
  emisor_nombre = 'Grupo Revenue SpA',
  emisor_email = 'finanzas@gruporevenue.com',
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Recordatorio de pago - Factura N°{String(folio)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Recordatorio de pago</Heading>
        <Text style={p}>Hola,</Text>
        <Text style={p}>
          Queremos recordarte que la factura electrónica N°{String(folio)} por <strong>{monto_formatted}</strong>
          {fecha_vencimiento ? ` con vencimiento el ${fecha_vencimiento}` : ''} se encuentra pendiente
          {dias_vencido > 0 ? ` (${dias_vencido} días de atraso)` : ''}.
        </Text>
        {pdf_url ? (
          <Section style={{ textAlign: 'center', margin: '20px 0' }}>
            <Button href={pdf_url} style={button}>Ver factura</Button>
          </Section>
        ) : null}
        <Text style={p}>
          Si ya realizaste el pago, agradecemos que ignores este mensaje. Ante cualquier duda,
          escríbenos a {emisor_email}.
        </Text>
        <Hr style={hr} />
        <Text style={signature}>{emisor_nombre}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoiceReminder,
  subject: (d: Record<string, any>) =>
    `Recordatorio: Factura N°${d?.folio ?? ''} pendiente`,
  displayName: 'Recordatorio de cobranza',
  previewData: { folio: '2885', monto_formatted: '$297.500', dias_vencido: 7 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111111' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '20px', fontWeight: 600, margin: '0 0 16px' }
const p = { fontSize: '14px', lineHeight: '22px', margin: '8px 0' }
const button = { backgroundColor: '#111111', color: '#ffffff', borderRadius: '6px', padding: '12px 20px', fontSize: '14px', textDecoration: 'none' }
const hr = { borderColor: '#e5e5e7', margin: '24px 0' }
const signature = { fontSize: '14px', fontWeight: 600, margin: '8px 0 0' }
