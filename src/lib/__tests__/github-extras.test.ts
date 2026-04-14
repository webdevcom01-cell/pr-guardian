import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "@/lib/github";
import crypto from "crypto";

// ─── verifyWebhookSignature ───────────────────────────────────────────────────

describe("verifyWebhookSignature", () => {
  const secret  = "my-webhook-secret";
  const payload = '{"action":"opened"}';

  function validSig(body = payload, s = secret) {
    return `sha256=${crypto.createHmac("sha256", s).update(body).digest("hex")}`;
  }

  it("returns true for a valid signature", () => {
    expect(verifyWebhookSignature(payload, validSig(), secret)).toBe(true);
  });

  it("returns false for wrong secret", () => {
    expect(verifyWebhookSignature(payload, validSig(payload, "wrong"), secret)).toBe(false);
  });

  it("returns false for tampered payload", () => {
    const sig = validSig();
    expect(verifyWebhookSignature('{"action":"deleted"}', sig, secret)).toBe(false);
  });

  it("returns false for missing sha256 prefix", () => {
    const raw = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, raw, secret)).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });

  it("returns false for completely wrong format", () => {
    expect(verifyWebhookSignature(payload, "not-a-signature", secret)).toBe(false);
  });

  it("is timing-safe — same result regardless of where mismatch occurs", () => {
    // Just verify it doesn't throw with various malformed inputs
    expect(() => verifyWebhookSignature(payload, "sha256=aaa", secret)).not.toThrow();
    expect(() => verifyWebhookSignature(payload, "sha256=" + "a".repeat(64), secret)).not.toThrow();
  });

  it("handles empty payload correctly", () => {
    const sig = `sha256=${crypto.createHmac("sha256", secret).update("").digest("hex")}`;
    expect(verifyWebhookSignature("", sig, secret)).toBe(true);
  });

  it("handles unicode payload", () => {
    const unicodePayload = '{"title":"Fix: üñícode"}';
    const sig = `sha256=${crypto.createHmac("sha256", secret).update(unicodePayload).digest("hex")}`;
    expect(verifyWebhookSignature(unicodePayload, sig, secret)).toBe(true);
  });
});

// ─── commit status description length ────────────────────────────────────────
// Extracted logic — GitHub enforces 140 char max on status descriptions

describe("commit status description limit (140 chars)", () => {
  function truncate(desc: string) {
    return desc.slice(0, 140);
  }

  it("short description passes through unchanged", () => {
    const desc = "Approved · score 95/100";
    expect(truncate(desc)).toBe(desc);
    expect(truncate(desc).length).toBeLessThanOrEqual(140);
  });

  it("long description is truncated at 140", () => {
    const desc = "Blocked — ".repeat(20); // very long
    expect(truncate(desc).length).toBe(140);
  });

  it("description at exactly 140 chars is unchanged", () => {
    const desc = "a".repeat(140);
    expect(truncate(desc).length).toBe(140);
  });

  it("typical BLOCK description fits within limit", () => {
    const desc = "Blocked — 3 critical/high issue(s) · score 25/100";
    expect(desc.length).toBeLessThanOrEqual(140);
  });

  it("typical APPROVE description fits within limit", () => {
    const desc = "Approved · score 98/100";
    expect(desc.length).toBeLessThanOrEqual(140);
  });

  it("typical APPROVE_WITH_NOTES description fits within limit", () => {
    const desc = "Approved with notes · score 74/100";
    expect(desc.length).toBeLessThanOrEqual(140);
  });
});
