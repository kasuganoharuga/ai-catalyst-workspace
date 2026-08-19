import { describe, expect, it } from "vitest";

import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

describe("isModuleResetAllowed", () => {
  it("allows the deployments where wiping progress is a convenience", () => {
    expect(isModuleResetAllowed("local")).toBe(true);
    expect(isModuleResetAllowed("development")).toBe(true);
    expect(isModuleResetAllowed("test")).toBe(true);
    expect(isModuleResetAllowed("staging")).toBe(true);
  });

  it("refuses production", () => {
    expect(isModuleResetAllowed("production")).toBe(false);
  });

  // The reason this file exists. A task definition that lost APP_ENV must not
  // hand Founders an irreversible delete; losing the testing tool is the
  // cheaper of the two failures.
  it("refuses a missing or blank APP_ENV", () => {
    expect(isModuleResetAllowed(undefined)).toBe(false);
    expect(isModuleResetAllowed("")).toBe(false);
    expect(isModuleResetAllowed("  ")).toBe(false);
  });

  it("refuses anything unrecognised, including a near miss", () => {
    expect(isModuleResetAllowed("prod")).toBe(false);
    expect(isModuleResetAllowed("stagng")).toBe(false);
    expect(isModuleResetAllowed("preview")).toBe(false);
  });

  it("is case- and whitespace-insensitive on the values it does accept", () => {
    expect(isModuleResetAllowed(" Staging ")).toBe(true);
    expect(isModuleResetAllowed("LOCAL")).toBe(true);
  });
});
