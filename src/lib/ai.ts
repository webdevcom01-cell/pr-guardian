import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export function getModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic("claude-sonnet-4-6");
  }
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai("gpt-4o");
  }
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

export function getModelName(): string {
  if (process.env.ANTHROPIC_API_KEY) return "claude-sonnet-4-6";
  if (process.env.OPENAI_API_KEY) return "gpt-4o";
  return "unknown";
}
