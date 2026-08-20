import type { EmailMessage, EmailTransport } from "../types.js";

/** Logs and discards — default when EMAIL_PROVIDER is unset (no SES required). */
export class NoopEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<void> {
    console.info(
      `[email:noop] to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
  }
}
