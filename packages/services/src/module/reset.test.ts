import { describe, expect, it } from "vitest";

import { isModuleResetAllowed } from "@ai-catalyst/services/module/reset-allowed";

describe("isModuleResetAllowed", () => {
  it("allows local even when NODE_ENV is production (docker / next start)", () => {
    expect(isModuleResetAllowed("local", "production")).toBe(true);
  });

  it("allows staging even when NODE_ENV is production (deployed staging image)", () => {
    expect(isModuleResetAllowed("staging", "production")).toBe(true);
  });

  it("refuses production regardless of NODE_ENV", () => {
    expect(isModuleResetAllowed("production", "production")).toBe(false);
    expect(isModuleResetAllowed("production", "development")).toBe(false);
  });

  it("refuses a production Node build when APP_ENV is missing", () => {
    expect(isModuleResetAllowed(undefined, "production")).toBe(false);
    expect(isModuleResetAllowed("  ", "production")).toBe(false);
  });

  it("allows unset APP_ENV in non-production Node (pnpm dev / vitest)", () => {
    expect(isModuleResetAllowed(undefined, "development")).toBe(true);
    expect(isModuleResetAllowed(undefined, "test")).toBe(true);
  });
});
