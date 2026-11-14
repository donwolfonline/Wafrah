import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "@/lib/password";

describe("password and PIN hashing helper", () => {
  it("hashes and verifies passwords and PINs accurately", () => {
    const hash = hashSecret("WafrahAdmin!2026");
    expect(verifySecret("WafrahAdmin!2026", hash)).toBe(true);
    expect(verifySecret("wrong-password", hash)).toBe(false);
  });

  it("produces unique bcrypt hashes for identical inputs that both verify", () => {
    const h1 = hashSecret("1234");
    const h2 = hashSecret("1234");
    expect(h1.startsWith("$2")).toBe(true);
    expect(h1).not.toBe(h2);
    expect(verifySecret("1234", h1)).toBe(true);
    expect(verifySecret("1234", h2)).toBe(true);
  });
});
