import { describe, expect, it } from "vitest";

import { generateTemporaryPassword } from "./password-recovery.js";

// Unambiguous alphabet only — no 0/O, 1/l/I — see password-recovery.ts's
// own comment for why (a password retyped after being read off a screen).
const TEMPORARY_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

describe("generateTemporaryPassword", () => {
  it("is always 16 characters long", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(generateTemporaryPassword()).toHaveLength(16);
    }
  });

  it("only ever uses characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 20; i += 1) {
      const password = generateTemporaryPassword();
      for (const char of password) {
        expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char);
      }
    }
  });

  it("never contains a visually ambiguous character (0, O, 1, l, I)", () => {
    const ambiguous = ["0", "O", "1", "l", "I"];
    for (let i = 0; i < 20; i += 1) {
      const password = generateTemporaryPassword();
      for (const char of ambiguous) {
        expect(password).not.toContain(char);
      }
    }
  });

  it("produces different passwords across calls", () => {
    const passwords = new Set(
      Array.from({ length: 20 }, () => generateTemporaryPassword()),
    );
    // Not a strict uniqueness guarantee (it's random), but 20 draws from a
    // ~79-bit space colliding would indicate a broken generator.
    expect(passwords.size).toBe(20);
  });
});
