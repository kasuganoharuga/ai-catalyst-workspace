export type {
  EmailConfig,
  EmailMessage,
  EmailReceipt,
  EmailSender,
  EmailTransport,
} from "./types.js";
export { loadEmailConfigFromEnv } from "./config.js";
export {
  createEmailSender,
  createEmailSenderFromConfig,
  resolveEmailTransport,
} from "./sender.js";
export { NoopEmailTransport } from "./transports/noop.js";
export { SesEmailTransport } from "./transports/ses.js";
