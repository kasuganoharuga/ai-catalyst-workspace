import type {
  EmailConfig,
  EmailMessage,
  EmailSender,
  EmailTransport,
} from "./types.js";
// Package paths, not "./transports/*.js" — see the note in index.ts.
import { NoopEmailTransport } from "@ai-catalyst/services/email/transports/noop";
import { SesEmailTransport } from "@ai-catalyst/services/email/transports/ses";

export function resolveEmailTransport(config: EmailConfig): EmailTransport {
  if (config.kind === "noop") {
    return new NoopEmailTransport();
  }
  return new SesEmailTransport({ from: config.from, region: config.region });
}

/**
 * Queue-ready sender: business code only calls `enqueue`. V1 awaits
 * transport.send immediately; a future SQS-backed enqueue can replace the
 * body without changing callers. Return type may later become EmailReceipt.
 */
export function createEmailSender(transport: EmailTransport): EmailSender {
  return {
    async enqueue(message: EmailMessage): Promise<void> {
      await transport.send(message);
    },
  };
}

export function createEmailSenderFromConfig(config: EmailConfig): EmailSender {
  return createEmailSender(resolveEmailTransport(config));
}
