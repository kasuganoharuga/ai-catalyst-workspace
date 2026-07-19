import {
  SESv2Client,
  SendEmailCommand,
  type SESv2ClientConfig,
} from "@aws-sdk/client-sesv2";

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
  }
}
