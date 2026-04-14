import { describe, it, expect } from "vitest";
import { applyConfig } from "@/lib/config";

function fileDiff(filename: string, content = "+line"): string {
  return `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${content}`;
}

describe("applyConfig", () => {
  it("returns diff unchanged when config is empty", () => {
    const diff = fileDiff("src/index.ts");
    expect(applyConfig({}, diff)).toBe(diff);
  });

  it("filters out yarn.lock but keeps other files", () => {
    const tsSection = fileDiff("src/index.ts");
    const lockSection = fileDiff("yarn.lock");
    const diff = `${tsSection}\n${lockSection}`;

    const result = applyConfig({ skipPaths: ["*.lock"] }, diff);
    expect(result).toContain("src/index.ts");
    expect(result).not.toContain("yarn.lock");
  });

  it("keeps only .ts files when reviewLanguages is ['.ts']", () => {
    const tsSection = fileDiff("src/app.ts");
    const jsSection = fileDiff("src/util.js");
    const cssSection = fileDiff("styles/main.css");
    const diff = [tsSection, jsSection, cssSection].join("\n");

    const result = applyConfig({ reviewLanguages: [".ts"] }, diff);
    expect(result).toContain("src/app.ts");
    expect(result).not.toContain("src/util.js");
    expect(result).not.toContain("styles/main.css");
  });

  it("applies both skipPaths and reviewLanguages together", () => {
    const tsSection = fileDiff("src/app.ts");
    const generatedTs = fileDiff("dist/app.ts");
    const jsSection = fileDiff("src/util.js");
    const diff = [tsSection, generatedTs, jsSection].join("\n");

    const result = applyConfig({ skipPaths: ["dist/**"], reviewLanguages: [".ts"] }, diff);
    expect(result).toContain("src/app.ts");
    expect(result).not.toContain("dist/app.ts");
    expect(result).not.toContain("src/util.js");
  });

  it("returns diff as-is when there are no diff --git lines", () => {
    const noDiff = "just some text\nwith no git headers";
    expect(applyConfig({ skipPaths: ["*.lock"] }, noDiff)).toBe(noDiff);
  });

  it("returns empty string when all files are filtered", () => {
    const diff = fileDiff("yarn.lock");
    const result = applyConfig({ skipPaths: ["*.lock"] }, diff);
    expect(result.trim()).toBe("");
  });

  it("excludes extensionless files when reviewLanguages is set", () => {
    const noExtSection = fileDiff("Makefile");
    const tsSection = fileDiff("src/app.ts");
    const diff = `${noExtSection}\n${tsSection}`;

    const result = applyConfig({ reviewLanguages: [".ts"] }, diff);
    expect(result).not.toContain("Makefile");
    expect(result).toContain("src/app.ts");
  });
});
