import type { RequestHandler } from "express";
import type { AIStatus, CoverLetterRequest } from "@shared/types/ai";
import { CLAUDE_MODEL, isClaudeConfigured } from "@shared/lib/ai/claude";
import { runAnalysis, runAnswers, startCoverLetterStream } from "@shared/lib/ai/engine";
import { analyzeRequestSchema, answersRequestSchema, coverLetterRequestSchema } from "@shared/lib/ai/schemas";
import { parse } from "../utils/http-error";

export const status: RequestHandler = (_req, res) => {
  const enabled = isClaudeConfigured();
  const body: AIStatus = { aiEnabled: enabled, model: enabled ? CLAUDE_MODEL : null };
  res.json(body);
};

export const analyze: RequestHandler = async (req, res) => {
  const body = parse(analyzeRequestSchema, req.body);
  const { data, warning } = await runAnalysis(body);
  res.json({ analysis: data, warning: warning ?? null });
};

export const answers: RequestHandler = async (req, res) => {
  const body = parse(answersRequestSchema, req.body);
  const { data, warning } = await runAnswers(body);
  res.json({ answers: data, warning: warning ?? null });
};

/**
 * Streams the cover letter as plain text.
 *   X-Engine: "claude" | "local"      X-Warning: URI-encoded fallback notice (optional)
 */
export const coverLetter: RequestHandler = async (req, res) => {
  const body = parse(coverLetterRequestSchema, req.body) as CoverLetterRequest;
  const { engine, warning, chunks } = await startCoverLetterStream(body);

  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Engine", engine);
  if (warning) res.setHeader("X-Warning", encodeURIComponent(warning));
  res.flushHeaders();

  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
  });

  try {
    for await (const chunk of chunks) {
      if (clientGone) break;
      res.write(chunk);
    }
  } catch (error) {
    console.error("[cover-letter] stream failed:", error instanceof Error ? error.message : error);
    res.destroy(error instanceof Error ? error : undefined);
    return;
  } finally {
    await chunks.return(undefined);
  }
  res.end();
};
