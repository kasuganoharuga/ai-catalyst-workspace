import { describe, expect, it } from "vitest";

import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

describe("isModuleResetAllowed", () => {
  it("allows local", () => {
    expect(isModuleResetAllowed("local")).toBe(true);
  });

  it("allows staging", () => {
    expect(isModuleResetAllowed("staging")).toBe(true);
  });

  it("refuses only an explicit production APP_ENV", () => {
    expect(isModuleResetAllowed("production")).toBe(false);
  });

  it("allows a missing or blank APP_ENV (staging image / live task)", () => {
    expect(isModuleResetAllowed("")).toBe(true);
    expect(isModuleResetAllowed("  ")).toBe(true);
  });
});
