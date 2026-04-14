import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createId } from "@paralleldrive/cuid2";
import { minimatch } from "minimatch";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getRepoTree, getFileContent } from "@/lib/github";

const MAX_FILES_TO_INDEX = 150;
const EMBED_BATCH_SIZE = 100;
const FETCH_CONCURRENCY = 10;
const MAX_DIFF_EMBED_CHARS = 8_000;
const MAX_CONTEXT_CHARS = 6_000;
const MAX_FILE_CONTENT_PREVIEW = 2_000;
const TOP_K = 5;

export function getEmbeddingModel() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for embeddings");
  return createOpenAI({ apiKey }).embedding("text-embedding-3-small");
}

function scoreFile(filePath: string): number {
  const name = filePath.split("/").pop() ?? filePath;

  if (["README.md", "readme.md", "README.mdx"].includes(name)) return 100;

  if (
    name === "tsconfig.json" ||
    name === "package.json" ||
    name === ".env.example" ||
    name.endsWith(".config.ts") ||
    name.endsWith(".config.js")
  ) return 80;

  if (
    minimatch(filePath, "src/**/*.ts") || minimatch(filePath, "src/**/*.tsx") ||
    minimatch(filePath, "src/**/*.py") || minimatch(filePath, "src/**/*.go") ||
    minimatch(filePath, "src/**/*.rs") || minimatch(filePath, "src/**/*.java")
  ) return 70;

  const dotIndex = filePath.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filePath.slice(dotIndex) : "";
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"].includes(ext)) return 50;

  return 10;
}

export async function ensureVectorExtension(): Promise<void> {
  // TODO: requires pgvector extension on PostgreSQL (pre-installed on Railway)
  // The CREATE EXTENSION call will handle setup at runtime
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS repo_index_embedding_idx ON "RepoIndex" USING hnsw (embedding vector_cosine_ops)`;
  } catch {
    // Extension may already exist or not yet available — non-fatal
  }
}

export async function indexRepository(
  repoId: string,
  owner: string,
  repo: string,
  userToken?: string,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("OPENAI_API_KEY not set — skipping RAG indexing", { repoId });
    return;
  }

  await ensureVectorExtension();

  const tree = await getRepoTree(owner, repo, userToken);

  const topFiles = tree
    .map((file) => ({ ...file, score: scoreFile(file.path) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FILES_TO_INDEX);

  const fetched: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < topFiles.length; i += FETCH_CONCURRENCY) {
    const batch = topFiles.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (file) => {
        const content = await getFileContent(owner, repo, file.path, userToken);
        return content ? { path: file.path, content } : null;
      }),
    );
    for (const result of results) {
      if (result) fetched.push(result);
    }
  }

  if (fetched.length === 0) return;

  const model = getEmbeddingModel();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < fetched.length; i += EMBED_BATCH_SIZE) {
    const batch = fetched.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model,
      values: batch.map((f) => f.content.slice(0, MAX_DIFF_EMBED_CHARS)),
    });
    allEmbeddings.push(...embeddings);
  }

  const commitSha = "HEAD";

  for (let i = 0; i < fetched.length; i++) {
    const { path: filePath, content } = fetched[i];
    const embedding = allEmbeddings[i];
    const id = createId();
    const embeddingStr = JSON.stringify(embedding);

    await prisma.$executeRaw`
      INSERT INTO "RepoIndex" (id, "repoId", "filePath", content, embedding, "commitSha", "indexedAt")
      VALUES (${id}, ${repoId}, ${filePath}, ${content}, ${embeddingStr}::vector, ${commitSha}, NOW())
      ON CONFLICT ("repoId", "filePath") DO UPDATE
      SET content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          "commitSha" = EXCLUDED."commitSha",
          "indexedAt" = EXCLUDED."indexedAt"
    `;
  }

  logger.info("Indexed repository", { repoId, owner, repo, fileCount: fetched.length });
}

export async function getContextForReview(
  repoId: string,
  diff: string,
  _userToken?: string,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "";

  try {
    const model = getEmbeddingModel();
    const { embedding: diffEmbedding } = await embed({
      model,
      value: diff.slice(0, MAX_DIFF_EMBED_CHARS),
    });

    const rows = await prisma.$queryRaw<Array<{ filePath: string; content: string }>>`
      SELECT "filePath", content
      FROM "RepoIndex"
      WHERE "repoId" = ${repoId}
      ORDER BY embedding <-> ${JSON.stringify(diffEmbedding)}::vector
      LIMIT 5
    `;

    if (!rows.length) return "";

    const header = "CODEBASE CONTEXT (most relevant files from the repository):\n\n";
    const perFileBudget = Math.floor((MAX_CONTEXT_CHARS - header.length) / rows.length);

    let result = header;
    for (const row of rows) {
      const fileHeader = `--- FILE: ${row.filePath} ---\n`;
      const contentBudget = Math.max(0, perFileBudget - fileHeader.length - 2);
      const content = row.content.slice(0, Math.min(MAX_FILE_CONTENT_PREVIEW, contentBudget));
      result += `${fileHeader}${content}\n\n`;
      if (result.length >= MAX_CONTEXT_CHARS) break;
    }

    return result.slice(0, MAX_CONTEXT_CHARS);
  } catch {
    return "";
  }
}
