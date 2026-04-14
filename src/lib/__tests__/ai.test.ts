import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock AI SDK providers so buildCandidates() returns dummy model objects
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ provider: "openai", modelId })),
}));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ provider: "anthropic", modelId })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import { callWithFallback } from "@/lib/ai";

describe("callWithFallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Give two candidates: DeepSeek + OpenAI
    process.env.DEEPSEEK_API_KEY = "test-deepseek";
    process.env.OPENAI_API_KEY = "test-openai";
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns result and modelId from first successful call", async () => {
    const fn = vi.fn().mockResolvedValue({ text: "review" });
    const { result, modelId } = await callWithFallback(fn);
    expect(result).toEqual({ text: "review" });
    expect(modelId).toBe("deepseek-chat"); // first candidate
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("falls back to second model when first throws", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("Rate limit");
      return { text: "fallback result" };
    });

    const { result, modelId } = await callWithFallback(fn);
    expect(result).toEqual({ text: "fallback result" });
    expect(modelId).toBe("gpt-4o"); // second candidate
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the last error when all candidates fail", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("DeepSeek error"))
      .mockRejectedValueOnce(new Error("OpenAI error"));

    await expect(callWithFallback(fn)).rejects.toThrow("OpenAI error");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws when no AI provider env vars are set", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const fn = vi.fn();
    await expect(callWithFallback(fn)).rejects.toThrow("No AI models configured");
    expect(fn).not.toHaveBeenCalled();
  });

  it("uses preferred model as first candidate when specified", async () => {
    const capturedModels: unknown[] = [];
    const fn = vi.fn().mockImplementation(async (model) => {
      capturedModels.push(model);
      return { text: "ok" };
    });

    await callWithFallback(fn, "gpt-4o-mini");
    // First candidate should have the preferred modelId
    expect((capturedModels[0] as { modelId: string }).modelId).toBe("gpt-4o-mini");
  });

  it("returns on first success without trying other candidates", async () => {
    const fn = vi.fn().mockResolvedValue({ text: "ok" });
    await callWithFallback(fn);
    // With 2 env vars set (deepseek + openai), fn should be called once
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("logs a warning for each failed model", async () => {
    const { logger } = await import("@/lib/logger");
    const warnSpy = vi.spyOn(logger, "warn");

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockResolvedValueOnce({ text: "ok" });

    await callWithFallback(fn);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("Model failed, trying fallback", expect.objectContaining({
      error: "fail 1",
    }));
  });

  it("with three providers, falls through to third on two failures", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";

    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls <= 2) throw new Error(`fail ${calls}`);
      return { text: "third success" };
    });

    const { result, modelId } = await callWithFallback(fn);
    expect(result).toEqual({ text: "third success" });
    expect(modelId).toBe("claude-sonnet-4-6");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
