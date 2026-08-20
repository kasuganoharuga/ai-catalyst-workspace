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

  // The `client` injection point existed from the start but was never
  // exercised: every earlier assertion stopped at `toBeInstanceOf`, so the
  // command SES actually receives — and what happens when it rejects — was
  // untested. That is the path a sign-in code depends on.
  describe("SesEmailTransport.send", () => {
    function transportWithClient(send: ReturnType<typeof vi.fn>) {
      return new SesEmailTransport({
        from: "noreply@example.com",
        region: "ap-southeast-2",
        client: { send } as unknown as ConstructorParameters<
          typeof SesEmailTransport
        >[0]["client"],
      });
    }

    it("sends text-only content when no html is supplied", async () => {
      const send = vi.fn().mockResolvedValue({});
      await transportWithClient(send).send({
        to: "founder@example.com",
        subject: "Your code",
        text: "123456",
      });

      expect(send).toHaveBeenCalledTimes(1);
      const { input } = send.mock.calls[0][0];
      expect(input.FromEmailAddress).toBe("noreply@example.com");
      expect(input.Destination.ToAddresses).toEqual(["founder@example.com"]);
      expect(input.Content.Simple.Body.Text.Data).toBe("123456");
      // Absent, not present-and-empty: SES rejects an empty Html part.
      expect(input.Content.Simple.Body.Html).toBeUndefined();
    });

    it("includes an html part only when supplied", async () => {
      const send = vi.fn().mockResolvedValue({});
      await transportWithClient(send).send({
        to: "founder@example.com",
        subject: "Your code",
        text: "123456",
        html: "<p>123456</p>",
      });

      const { input } = send.mock.calls[0][0];
      expect(input.Content.Simple.Body.Html.Data).toBe("<p>123456</p>");
    });

    // The sandbox failure mode: an unverified recipient rejects here. It must
    // arrive as a typed EMAIL_SEND_FAILED rather than a raw AWS SDK throw
    // escaping into a server action or an auth endpoint.
    it("wraps a transport rejection as EMAIL_SEND_FAILED and keeps the cause diagnosable", async () => {
      const rejection = Object.assign(
        new Error("Email address is not verified."),
        {
          name: "MessageRejected",
        },
      );
      const send = vi.fn().mockRejectedValue(rejection);

      await expect(
        transportWithClient(send).send({
          to: "unverified@example.com",
          subject: "Your code",
          text: "123456",
        }),
      ).rejects.toMatchObject({
        code: "EMAIL_SEND_FAILED",
        message: expect.stringContaining("MessageRejected"),
      });
    });

    it("does not leak the recipient address into the error message", async () => {
      const send = vi
        .fn()
        .mockRejectedValue(new Error("Email address is not verified."));

      await expect(
        transportWithClient(send).send({
          to: "private@example.com",
          subject: "Your code",
          text: "123456",
        }),
      ).rejects.not.toThrow(/private@example\.com/);
    });
  });
});
