import { describe, expect, it } from "vitest";

import { parseTrustedProxies } from "@/lib/trusted-proxies";

/**
 * The contract Terraform feeds. A parsing slip here does not fail loudly — it
 * yields an empty list, which silently drops Better Auth back to one shared
 * rate-limit bucket for every caller that sends `X-Forwarded-For` itself.
 */
describe("parseTrustedProxies", () => {
  it("reads a single CIDR", () => {
    expect(parseTrustedProxies("10.30.0.0/16")).toEqual(["10.30.0.0/16"]);
  });

  it("splits a list and tolerates the spacing a human would type", () => {
    expect(
      parseTrustedProxies("10.30.0.0/16, 10.40.0.0/16 ,10.50.0.0/16"),
    ).toEqual(["10.30.0.0/16", "10.40.0.0/16", "10.50.0.0/16"]);
  });

  it("treats unset, empty and separator-only values as no trusted proxy", () => {
    // The important case: local and CI have no proxy in front, and an empty
    // list is what keeps Better Auth on its stricter single-value rule rather
    // than trusting a chain nobody appended.
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies("")).toEqual([]);
    expect(parseTrustedProxies("   ")).toEqual([]);
    expect(parseTrustedProxies(",,")).toEqual([]);
  });
});
