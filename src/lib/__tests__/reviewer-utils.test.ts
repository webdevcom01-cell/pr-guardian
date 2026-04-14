import { describe, it, expect } from "vitest";
import { splitDiffIntoChunks, mergeReviews } from "@/lib/reviewer";
import type { ChunkResult } from "@/lib/reviewer";

const CHUNK_SIZE = 80_000;

function makeFileDiff(filename: string, sizeBytes: number): string {
  const header = `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n`;
  const padding = "x".repeat(Math.max(0, sizeBytes - header.length));
  return header + padding;
}

function makeReview(overrides: Partial<ChunkResult["review"]> = {}): ChunkResult["review"] {
  return {
    decision: "APPROVE",
    compositeScore: 80,
    securityScore: 90,
    qualityScore: 75,
    issues: [],
    summary: "Looks good",
    ...overrides,
  };
}

describe("splitDiffIntoChunks", () => {
  it("returns single chunk when diff is below CHUNK_SIZE", () => {
    const diff = makeFileDiff("src/foo.ts", 1_000);
    const chunks = splitDiffIntoChunks(diff);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(diff);
  });

  it("groups first two ~40KB files together and puts third in second chunk", () => {
    const f1 = makeFileDiff("src/a.ts", 40_000);
    const f2 = makeFileDiff("src/b.ts", 40_000);
    const f3 = makeFileDiff("src/c.ts", 40_000);
    const diff = [f1, f2, f3].join("\n");

    const chunks = splitDiffIntoChunks(diff);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("src/a.ts");
    expect(chunks[0]).toContain("src/b.ts");
    expect(chunks[1]).toContain("src/c.ts");
  });

  it("keeps a single oversized file in one chunk without splitting mid-file", () => {
    const bigFile = makeFileDiff("src/huge.ts", CHUNK_SIZE + 10_000);
    const chunks = splitDiffIntoChunks(bigFile);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("src/huge.ts");
  });

  it("returns empty array for empty string", () => {
    expect(splitDiffIntoChunks("")).toEqual([]);
  });
});

describe("mergeReviews", () => {
  it("returns single result unchanged with coveragePercent 100", () => {
    const result: ChunkResult = { review: makeReview({ compositeScore: 75 }), chunkSize: 200 };
    const merged = mergeReviews([result]);
    expect(merged.coveragePercent).toBe(100);
    expect(merged.review.compositeScore).toBe(75);
    expect(merged.review.decision).toBe("APPROVE");
  });

  it("takes BLOCK as the merged decision when one chunk is BLOCK", () => {
    const r1: ChunkResult = { review: makeReview({ decision: "APPROVE" }), chunkSize: 100 };
    const r2: ChunkResult = { review: makeReview({ decision: "BLOCK" }), chunkSize: 100 };
    expect(mergeReviews([r1, r2]).review.decision).toBe("BLOCK");
  });

  it("takes APPROVE_WITH_NOTES when one chunk is APPROVE_WITH_NOTES and other is APPROVE", () => {
    const r1: ChunkResult = { review: makeReview({ decision: "APPROVE" }), chunkSize: 100 };
    const r2: ChunkResult = { review: makeReview({ decision: "APPROVE_WITH_NOTES" }), chunkSize: 100 };
    expect(mergeReviews([r1, r2]).review.decision).toBe("APPROVE_WITH_NOTES");
  });

  it("computes byte-weighted composite score correctly", () => {
    const r1: ChunkResult = { review: makeReview({ compositeScore: 80 }), chunkSize: 100 };
    const r2: ChunkResult = { review: makeReview({ compositeScore: 40 }), chunkSize: 300 };
    // (80*100 + 40*300) / 400 = (8000 + 12000) / 400 = 50
    expect(mergeReviews([r1, r2]).review.compositeScore).toBe(50);
  });

  it("flattens issues from all chunks", () => {
    const issue1 = { severity: "HIGH" as const, category: "security" as const, file: "a.ts", message: "m1", fix: "f1" };
    const issue2 = { severity: "LOW" as const, category: "quality" as const, file: "b.ts", message: "m2", fix: "f2" };
    const r1: ChunkResult = { review: makeReview({ issues: [issue1] }), chunkSize: 100 };
    const r2: ChunkResult = { review: makeReview({ issues: [issue2] }), chunkSize: 100 };
    const merged = mergeReviews([r1, r2]);
    expect(merged.review.issues).toHaveLength(2);
    expect(merged.review.issues).toContainEqual(issue1);
    expect(merged.review.issues).toContainEqual(issue2);
  });
});
