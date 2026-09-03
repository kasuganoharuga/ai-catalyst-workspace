import { describe, expect, it } from "vitest";

import { isActiveNavPath } from "@/components/nav/use-active-nav-item";

describe("isActiveNavPath", () => {
  it("matches the item's own path", () => {
    expect(isActiveNavPath("/modules", "/modules")).toBe(true);
  });

  it("matches a nested route by default", () => {
    expect(
      isActiveNavPath("/modules/module-01-pressure-test", "/modules"),
    ).toBe(true);
  });

  it("does not match a route that merely shares a text prefix", () => {
    expect(isActiveNavPath("/modules-archive", "/modules")).toBe(false);
  });

  it("does not match an unrelated route", () => {
    expect(isActiveNavPath("/dashboard", "/modules")).toBe(false);
  });

  // The one item that needs it: "/admin" must not also light up for
  // "/admin/users", unlike every other item's nested-route matching.
  it("exact:true matches only the item's own path, never a nested route", () => {
    expect(isActiveNavPath("/admin", "/admin", true)).toBe(true);
    expect(isActiveNavPath("/admin/users", "/admin", true)).toBe(false);
  });

  it("exact:false (the default) still matches nested routes for the same href", () => {
    expect(isActiveNavPath("/admin/users", "/admin", false)).toBe(true);
  });
});
