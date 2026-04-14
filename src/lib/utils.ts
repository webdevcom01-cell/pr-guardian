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

/** Score color — monochrome: white → gray → dim */
export function scoreColor(score: number) {
  if (score >= 80) return "text-white";
  if (score >= 60) return "text-zinc-400";
  return "text-zinc-600";
}

/** Decision badge — white / gray / dim */
export function decisionColor(decision: string) {
  if (decision === "APPROVE")
    return "text-white bg-white/10 border border-white/10";
  if (decision === "APPROVE_WITH_NOTES")
    return "text-zinc-300 bg-white/5 border border-white/5";
  return "text-zinc-500 bg-white/[0.03] border border-white/[0.06]";
}

/** Decision label — clean text, no emoji */
export function decisionLabel(decision: string) {
  if (decision === "APPROVE") return "Approved";
  if (decision === "APPROVE_WITH_NOTES") return "With notes";
  return "Blocked";
}
