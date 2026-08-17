/**
 * email barrel — value imports use @ai-catalyst/services/email/... package
 * paths, not relative ones, matching the mcp-auth barrel: Turbopack
 * (transpilePackages) cannot resolve ./x.js from a package-path entry (see
 * vercel/next.js#82945), and apps/web reaches this module from
 * lib/email.ts — including out of instrumentation.ts, where the failure takes
 * the whole dev server down at boot rather than one route. Type-only imports
 * are erased before any bundler sees them, so those may stay relative.
 */
export type {
  EmailConfig,
  EmailMessage,
  EmailReceipt,
  EmailSender,
  EmailTransport,
} from "./types.js";
export { loadEmailConfigFromEnv } from "@ai-catalyst/services/email/config";
export {
  createEmailSender,
  createEmailSenderFromConfig,
  resolveEmailTransport,
} from "@ai-catalyst/services/email/sender";
export { NoopEmailTransport } from "@ai-catalyst/services/email/transports/noop";
export { SesEmailTransport } from "@ai-catalyst/services/email/transports/ses";
