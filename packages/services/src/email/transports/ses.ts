import {
  SESv2Client,
  SendEmailCommand,
  type SESv2ClientConfig,
} from "@aws-sdk/client-sesv2";

import { ServiceError } from "@ai-catalyst/services/errors";
import type { EmailMessage, EmailTransport } from "../types.js";

export interface SesEmailTransportOptions {
  from: string;
  region: string;
  client?: SESv2Client;
}

export class SesEmailTransport implements EmailTransport {
  private readonly from: string;
  private readonly client: SESv2Client;

  constructor(options: SesEmailTransportOptions) {
    if (!options.from.trim()) {
      throw new Error("SesEmailTransport requires a non-empty from address.");
    }
    this.from = options.from;
    this.client =
      options.client ??
      new SESv2Client({ region: options.region } satisfies SESv2ClientConfig);
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: message.text, Charset: "UTF-8" },
                ...(message.html
                  ? { Html: { Data: message.html, Charset: "UTF-8" } }
                  : {}),
              },
            },
          },
        }),
      );
    } catch (error) {
      // A raw AWS SDK throw would otherwise surface verbatim in a server
      // action or an auth endpoint. The recipient address is deliberately
      // not in the message — this string can reach a founder, and the
      // address may not be theirs.
      //
      // The name matters more than it looks: in the SES sandbox an
      // unverified recipient fails here with MessageRejected, which is the
      // single most likely cause of "the sign-in code never arrived"
      // before production access is granted. Keeping the SDK error's name
      // and message makes that diagnosable from logs instead of guessable.
      const detail =
        error instanceof Error ? `${error.name}: ${error.message}` : "unknown";
      throw new ServiceError(
        "EMAIL_SEND_FAILED",
        `SES rejected the message (${detail}).`,
      );
    }
  }
}
