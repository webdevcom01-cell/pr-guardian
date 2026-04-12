import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

export function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

export function decisionColor(decision: string) {
  if (decision === "APPROVE") return "text-emerald-400 bg-emerald-400/10";
  if (decision === "APPROVE_WITH_NOTES") return "text-yellow-400 bg-yellow-400/10";
  return "text-red-400 bg-red-400/10";
}

export function decisionLabel(decision: string) {
  if (decision === "APPROVE") return "✅ Approved";
  if (decision === "APPROVE_WITH_NOTES") return "⚠️ Approved w/ notes";
  return "🚫 Blocked";
}
