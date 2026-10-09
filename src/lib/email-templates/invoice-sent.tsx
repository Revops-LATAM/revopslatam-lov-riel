import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

const LOGO_URL = 'https://rielapp.lovable.app/__l5e/assets-v1/50d1c57e-eebb-473a-86f1-5e3908c9ebe4/logo-revopslatam-blanco.png'


interface Props {
  folio?: string | number
  descripcion?: string
  monto_formatted?: string
  oc_reference?: string | null
  body_override?: string | null
  emisor_nombre?: string
  emisor_banco?: string
  emisor_tipo_cuenta?: string
  emisor_cuenta?: string
  emisor_rut?: string
  emisor_email?: string
}

const InvoiceSent = ({
  folio = '—',
  descripcion = 'los servicios contratados',
  monto_formatted = '$0',
  oc_reference,
  body_override,
  emisor_nombre = 'Grupo Revenue SpA',
  emisor_banco = 'Santander',
  emisor_tipo_cuenta = 'Cuenta corriente',
  emisor_cuenta = '69837271',
  emisor_rut = '76.181.981-K',
  emisor_email = 'finanzas@gruporevenue.com',
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Factura electrónica N°{String(folio)} - {monto_formatted}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={LOGO_URL} alt="RevOps LATAM" width="150" style={logo} />
        </Section>
        <Section style={inner}>
          {body_override ? (
            body_override.split(/\n\s*\n/).map((para, i) => {
              const trimmed = para.trim()
              const isHeading = /^(Datos para transferencia bancaria)$/i.test(trimmed)
              const isSignoff = /^(Muchas gracias)/i.test(trimmed)
              const style = isHeading ? pBold : isSignoff ? pSignoff : p
              return (
                <Text key={i} style={style}>
                  {para.split('\n').map((line, j, arr) => (
                    <React.Fragment key={j}>
                      {line}
                      {j < arr.length - 1 ? <br /> : null}
                    </React.Fragment>
                  ))}
                </Text>
              )
            })
          ) : (
            <>
              <Text style={p}>Hola,</Text>
              <Text style={p}>Esperamos que se encuentren muy bien.</Text>
              <Text style={p}>
                Adjuntamos la factura electrónica N°{String(folio)}, correspondiente a {descripcion}
                {oc_reference ? `, según la ${oc_reference}` : ''}.
              </Text>
              <Section style={amountBox}>
                <Text style={amountLabel}>Monto total</Text>
                <Text style={amountValue}>{monto_formatted}</Text>
              </Section>
              <Text style={p}>
                Quedamos atentos ante cualquier consulta o requerimiento relacionado con este proceso.
              </Text>
              <Text style={pBold}>Datos para transferencia bancaria</Text>
              <Text style={p}>
                En caso de que el pago se realice mediante transferencia, compartimos los datos a continuación:
              </Text>
              <Text style={p}>
                Nombre: {emisor_nombre}<br />
                Banco: {emisor_banco}<br />
                {emisor_tipo_cuenta}: {emisor_cuenta}<br />
                RUT: {emisor_rut}<br />
                Correo: {emisor_email}
              </Text>
              <Text style={pSignoff}>Muchas gracias por su confianza,</Text>
              <Text style={pSignature}>Equipo Finanzas Grupo Revenue</Text>
            </>
          )}
        </Section>

      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InvoiceSent,
  subject: (d: Record<string, any>) =>
    `Factura Electrónica ${d?.folio ?? ''} - Grupo Revenue`.trim(),
  displayName: 'Envío de factura',
  previewData: {
    folio: '2885',
    descripcion:
      'los servicios de Grabación, edición y producción de video Corporativo - campaña Meta',
    monto_formatted: '$297.500',
    oc_reference: 'OC 119 del 15 de Mayo',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f4f4f7', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111111', margin: 0, padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden' as const, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
const header = { background: 'linear-gradient(135deg, #BE1869 0%, #6224BE 50%, #0779D7 100%)', padding: '28px 32px', textAlign: 'center' as const }
const brand = { color: '#ffffff', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '2px' }
const brandSub = { color: '#ffffff', fontSize: '12px', margin: '4px 0 0', letterSpacing: '3px', opacity: 0.9 }
const logo = { display: 'block', margin: '0 auto', height: 'auto' as const }
const inner = { padding: '28px 32px' }
const p = { fontSize: '14px', lineHeight: '22px', margin: '10px 0', textAlign: 'justify' as const }
const pBold = { fontSize: '15px', lineHeight: '22px', margin: '20px 0 8px', fontWeight: 700 as const, color: '#111111' }
const pSignoff = { fontSize: '14px', lineHeight: '22px', margin: '28px 0 4px' }
const pSignature = { fontSize: '14px', lineHeight: '22px', margin: '0 0 24px', fontWeight: 600 as const }
const amountBox = { backgroundColor: '#f5f5f7', borderRadius: '8px', padding: '16px', margin: '20px 0', textAlign: 'center' as const }
const amountLabel = { fontSize: '12px', color: '#666', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const amountValue = { fontSize: '24px', fontWeight: 700, margin: 0, color: '#0779D7' }

