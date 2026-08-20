import { describe, expect, it, vi } from "vitest";

import { createLogger } from "@ai-catalyst/observability/logger";
import { redactLogFields } from "@ai-catalyst/observability/redact";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

describe("createLogger", () => {
  it("emits stable event + message fields in JSON mode", () => {
    const lines: string[] = [];
    const log = createLogger({
      service: SERVICE_NAMES.web,
      environment: "staging",
      level: "info",
      write: (_level, line) => {
        lines.push(line);
      },
    });

    log.warn({
      event: "module_checklist_state_mismatch",
      message: "Module checklist state does not match artifact owner attempt",
      answered: 0,
      total: 4,
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.event).toBe("module_checklist_state_mismatch");
    expect(parsed.message).toBe(
      "Module checklist state does not match artifact owner attempt",
    );
    expect(parsed.level).toBe("warn");
    expect(parsed.service).toBe("aicatalyst-web");
    expect(parsed.environment).toBe("staging");
    expect(parsed.answered).toBe(0);
  });

  it("never throws when the sink fails", () => {
    const log = createLogger({
      service: SERVICE_NAMES.services,
      environment: "local",
      write: () => {
        throw new Error("sink down");
      },
    });
    expect(() =>
      log.error({ event: "test_sink_failure", message: "should not throw" }),
    ).not.toThrow();
  });

  it("respects LOG level filtering", () => {
    const write = vi.fn();
    const log = createLogger({
      service: SERVICE_NAMES.mcp,
      environment: "local",
      level: "warn",
      write,
    });
    log.info({ event: "skipped" });
    log.warn({ event: "kept" });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("redactLogFields", () => {
  it("redacts tokens and answer bodies", () => {
    const redacted = redactLogFields({
      event: "ok",
      user_id: "u1",
      authorization: "Bearer secret",
      answer_text: "founder said this",
      metadata: { api_key: "abc", count: 2 },
    });
    expect(redacted.user_id).toBe("u1");
    expect(redacted.authorization).toBe("[Redacted]");
    expect(redacted.answer_text).toBe("[Redacted]");
    expect(redacted.metadata).toEqual({ api_key: "[Redacted]", count: 2 });
  });
});
