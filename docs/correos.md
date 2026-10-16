# Correos de Riel 2.0

Todos los correos salen directo por la API de Resend (`src/lib/email/resend.server.ts`). Ya no se
usa la cola `pgmq`, el vault, `pg_cron` ni el servicio Lovable Email.

## Flujo

1. `sendTransactionalEmailServer` (`src/lib/email/transactional.server.ts`) recibe plantilla, destinatario
   y datos.
2. Revisa la lista de supresión (`suppressed_emails`). Si no puede verificarla, no envía.
3. Renderiza la plantilla (React Email), agrega los encabezados `List-Unsubscribe` y envía.
4. Deja registro en `email_send_log`: `pending` → `sent` o `failed`.
5. Reintenta hasta 3 veces ante 429, 5xx o error de red. Un 4xx permanente falla de inmediato.
6. Las facturas (`invoice-email.functions.ts`) usan el mismo cliente, con el PDF adjunto.

Si el envío falla, la función lanza un error: los puntos de uso lo capturan (tickets, portal) o lo
muestran al usuario (envío de factura).

## Configuración (variables de entorno del servidor)

| Variable                | Para qué                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `RESEND_API_KEY`        | Clave de la API de Resend                                                          |
| `RESEND_WEBHOOK_SECRET` | Firma (`whsec_...`) del webhook de rebotes y quejas                                |
| `EMAIL_FROM_DOMAIN`     | Dominio verificado en Resend para tickets y portal (por defecto `revopslatam.com`) |
| `PUBLIC_APP_URL`        | Base de los enlaces de baja (por defecto `https://riel.revopslatam.com`)           |

## Pasos en Resend

1. **Verificar dominios** (Domains → Add): `revopslatam.com` (tickets, portal, notificaciones) y
   `gruporevenue.com` (facturas y recordatorios). Agregar los registros SPF, DKIM y DMARC que Resend indique.
   El subdominio `noti.revopslatam.com` estaba delegado a Lovable: hay que recuperar su DNS o usar el dominio raíz.
2. **Webhook** (Webhooks → Add): URL `https://<app>/api/public/webhooks/resend`, eventos
   `email.bounced` y `email.complained`. Copiar el secreto a `RESEND_WEBHOOK_SECRET`.

## Cambios de comportamiento respecto a Riel 1.0

- Los recordatorios de facturas salen como `Finanzas <finanzas@...>` (antes `noreply@`) y sin copia a finanzas.
- Un recordatorio solo se registra como enviado si salió al menos un correo (antes se registraba aunque fallara).
- El webhook ahora es de Resend y solo suprime rebotes permanentes y quejas de spam.
