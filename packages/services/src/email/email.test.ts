import { describe, expect, it, vi } from "vitest";

import { loadEmailConfigFromEnv } from "./config.js";
import {
  createEmailSender,
  createEmailSenderFromConfig,
  resolveEmailTransport,
} from "./sender.js";
import { NoopEmailTransport } from "./transports/noop.js";
import { SesEmailTransport } from "./transports/ses.js";

describe("email", () => {
  it("defaults to noop via env loader", () => {
    expect(loadEmailConfigFromEnv({})).toEqual({ kind: "noop" });
  });

  it("enqueue on noop completes without throwing", async () => {
    const sender = createEmailSenderFromConfig({ kind: "noop" });
    await expect(
      sender.enqueue({
        to: "founder@example.com",
        subject: "Invite",
        text: "Welcome",
      }),
    ).resolves.toBeUndefined();
  });

  it("enqueue delegates to transport.send (queue-ready sync path)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender = createEmailSender({ send });
    const message = {
      to: "a@b.c",
      subject: "s",
      text: "t",
    };
    await sender.enqueue(message);
    expect(send).toHaveBeenCalledWith(message);
  });

  it("resolveEmailTransport selects SES vs noop from config", () => {
    expect(resolveEmailTransport({ kind: "noop" })).toBeInstanceOf(
      NoopEmailTransport,
    );
    expect(
      resolveEmailTransport({
        kind: "ses",
        from: "noreply@example.com",
        region: "ap-southeast-2",
      }),
    ).toBeInstanceOf(SesEmailTransport);
  });
});
