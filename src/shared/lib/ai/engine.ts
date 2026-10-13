import type {
  AnalyzeRequest,
  AnswersRequest,
  CoverLetterRequest,
  DraftAnswer,
  MatchAnalysis,
} from "@shared/types/ai";
import {
  analyzeWithClaude,
  answerQuestionsWithClaude,
  isClaudeConfigured,
  streamCoverLetterWithClaude,
} from "@shared/lib/ai/claude";
import { analyzeLocal, answerQuestionsLocal, generateCoverLetterLocal } from "@shared/lib/ai/local-engine";

/**
 * Facade used by the route handlers. Prefers Claude when configured and transparently falls back to the
 * local engine on any failure (network, refusal, truncation, schema), reporting a warning to the caller.
 */

export interface EngineResult<T> {
  data: T;
  warning?: string;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function runAnalysis(req: AnalyzeRequest): Promise<EngineResult<MatchAnalysis>> {
  if (!isClaudeConfigured()) return { data: analyzeLocal(req) };
  try {
    return { data: await analyzeWithClaude(req) };
  } catch (error) {
    console.error("[analyze] Claude failed, using local engine:", describe(error));
    return { data: analyzeLocal(req), warning: `Claude was unavailable (${describe(error)}). Used the local engine instead.` };
  }
}

export async function runAnswers(req: AnswersRequest): Promise<EngineResult<DraftAnswer[]>> {
  if (!isClaudeConfigured()) return { data: answerQuestionsLocal(req) };
  try {
    return { data: await answerQuestionsWithClaude(req) };
  } catch (error) {
    console.error("[answers] Claude failed, using local engine:", describe(error));
    return { data: answerQuestionsLocal(req), warning: `Claude was unavailable (${describe(error)}). Used the local engine instead.` };
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function* streamLocalLetter(req: CoverLetterRequest): AsyncGenerator<string> {
  const letter = generateCoverLetterLocal(req);
  const tokens = letter.match(/\S+\s*|\n+/g) ?? [letter];
  for (const token of tokens) {
    yield token;
    await sleep(14);
  }
}

export interface LetterStream {
  engine: "claude" | "local";
  warning?: string;
  chunks: AsyncGenerator<string>;
}

/**
 * Starts the cover-letter stream. Claude is attempted first; if it fails before producing any text
 * the local engine takes over. A failure after text has started is surfaced to the client.
 */
export async function startCoverLetterStream(req: CoverLetterRequest): Promise<LetterStream> {
  if (!isClaudeConfigured()) return { engine: "local", chunks: streamLocalLetter(req) };

  const claude = streamCoverLetterWithClaude(req);
  try {
    const first = await claude.next();
    if (first.done) throw new Error("empty response");
    async function* withFirst(): AsyncGenerator<string> {
      yield first.value;
      yield* claude;
    }
    return { engine: "claude", chunks: withFirst() };
  } catch (error) {
    console.error("[cover-letter] Claude failed, using local engine:", describe(error));
    return {
      engine: "local",
      warning: `Claude was unavailable (${describe(error)}). Used the local engine instead.`,
      chunks: streamLocalLetter(req),
    };
  }
}
