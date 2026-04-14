import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, LanguageModelV1 } from "ai";
import { logger } from "@/lib/logger";

export function getModel(modelId?: string): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelId ?? "claude-sonnet-4-6");
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(modelId ?? "gpt-4o");
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

export function getModelName(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet-4-6";
  if (process.env.OPENAI_API_KEY) return "gpt-4o";
  return "unknown";
}

interface CandidateModel {
  modelId: string;
  model: LanguageModelV1;
}

function buildCandidates(preferredModelId?: string): CandidateModel[] {
  const candidates: CandidateModel[] = [];

  if (preferredModelId) {
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      candidates.push({ modelId: preferredModelId, model: anthropic(preferredModelId) });
    } else if (process.env.OPENAI_API_KEY) {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      candidates.push({ modelId: preferredModelId, model: openai(preferredModelId) });
    } else if (process.env.DEEPSEEK_API_KEY) {
      const deepseek = createOpenAI({ baseURL: "https://api.deepseek.com/v1", apiKey: process.env.DEEPSEEK_API_KEY });
      candidates.push({ modelId: preferredModelId, model: deepseek(preferredModelId) });
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    const deepseek = createOpenAI({ baseURL: "https://api.deepseek.com/v1", apiKey: process.env.DEEPSEEK_API_KEY });
    candidates.push({ modelId: "deepseek-chat", model: deepseek("deepseek-chat") });
  }

  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    candidates.push({ modelId: "gpt-4o", model: openai("gpt-4o") });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    candidates.push({ modelId: "claude-sonnet-4-6", model: anthropic("claude-sonnet-4-6") });
  }

  return candidates;
}

export async function callWithFallback<T>(
  fn: (model: LanguageModelV1) => Promise<T>,
  preferredModelId?: string,
): Promise<{ result: T; modelId: string }> {
  const candidates = buildCandidates(preferredModelId);

  if (candidates.length === 0) {
    throw new Error("No AI models configured");
  }

  let lastError: unknown;

  for (const { modelId, model } of candidates) {
    try {
      const result = await fn(model);
      return { result, modelId };
    } catch (err) {
      lastError = err;
      logger.warn("Model failed, trying fallback", {
        modelId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw lastError;
}
