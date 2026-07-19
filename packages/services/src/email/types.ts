/**
 * Outbound email contract.
 *
 * Business code calls `EmailSender.enqueue` only. V1 enqueue synchronously
 * delegates to an `EmailTransport.send`. Later, enqueue can push to SQS
 * (or return `EmailReceipt` with messageId/provider/queuedAt) without
 * changing invitation/auth call sites.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Reserved for a future return type from enqueue — not used in V1. */
export interface EmailReceipt {
  messageId: string;
  provider: string;
  queuedAt: Date;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailSender {
  /**
   * Accept a message for delivery. V1: awaits transport.send immediately.
   * Future: may enqueue to SQS and/or resolve to EmailReceipt.
   */
  enqueue(message: EmailMessage): Promise<void>;
}

export type EmailConfig =
  | { kind: "noop" }
  | { kind: "ses"; from: string; region: string };
