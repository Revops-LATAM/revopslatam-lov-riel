import type { ComponentType } from "react";
import { template as invoiceSentTemplate } from "./invoice-sent";
import { template as invoiceReminderTemplate } from "./invoice-reminder";
import { template as ticketReceivedTemplate } from "./ticket-received";
import { template as ticketResolvedTemplate } from "./ticket-resolved";
import { template as ticketQuestionTemplate } from "./ticket-question";
import { template as portalMagicLinkTemplate } from "./portal-magic-link";
import { template as ticketClientReplyTemplate } from "./ticket-client-reply";
import { template as notificationGenericTemplate } from "./notification-generic";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  to?: string;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  "invoice-sent": invoiceSentTemplate,
  "invoice-reminder": invoiceReminderTemplate,
  "ticket-received": ticketReceivedTemplate,
  "ticket-resolved": ticketResolvedTemplate,
  "ticket-question": ticketQuestionTemplate,
  "portal-magic-link": portalMagicLinkTemplate,
  "ticket-client-reply": ticketClientReplyTemplate,
  "notification-generic": notificationGenericTemplate,
};
