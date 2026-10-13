import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  AnalyzeRequest,
  AnswersRequest,
  CoverLetterRequest,
  DraftAnswer,
  MatchAnalysis,
} from "@shared/types/ai";
import {
  ANALYSIS_SYSTEM_PROMPT,
  ANSWERS_SYSTEM_PROMPT,
  COVER_LETTER_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
  buildAnswersUserPrompt,
  buildCoverLetterUserPrompt,
} from "@shared/lib/ai/prompts";
import { analysisOutputSchema, answersOutputSchema } from "@shared/lib/ai/schemas";
import { computeOverallScore, verdictFor } from "@shared/lib/ai/scoring";
import { clamp, uid } from "@shared/lib/utils";

/**
 * Server-only Claude integration. Only import this from route handlers.
 * Credentials resolve through the SDK (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile).
 */

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let cached: Anthropic | null = null;

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!cached) cached = new Anthropic();
  return cached;
}

export class ClaudeUnavailableError extends Error {}

function assertUsable(stopReason: string | null | undefined): void {
  if (stopReason === "refusal") throw new ClaudeUnavailableError("The model declined this request.");
  if (stopReason === "max_tokens") throw new ClaudeUnavailableError("The model response was cut off.");
}

/** Clamp a model-provided score into the 0-100 integer range. */
function normaliseScore(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 100));
}

export async function analyzeWithClaude(req: AnalyzeRequest): Promise<MatchAnalysis> {
  const response = await getClient().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: ANALYSIS_SYSTEM_PROMPT,
    output_config: {
      effort: "high",
      format: zodOutputFormat(analysisOutputSchema),
    },
    messages: [{ role: "user", content: buildAnalysisUserPrompt(req) }],
  });

  assertUsable(response.stop_reason);
  const out = response.parsed_output;
  if (!out) throw new ClaudeUnavailableError("The model returned an unparseable analysis.");

  const category = (c: typeof out.breakdown.hardSkills) => ({
    ...c,
    score: normaliseScore(c.score),
    matched: c.matched.slice(0, 12),
    missing: c.missing.slice(0, 12),
  });
  const breakdown = {
    hardSkills: category(out.breakdown.hardSkills),
    softSkills: category(out.breakdown.softSkills),
    experience: category(out.breakdown.experience),
    tools: category(out.breakdown.tools),
  };
  const overallScore = computeOverallScore(breakdown);

  return {
    overallScore,
    verdict: verdictFor(overallScore),
    headline: out.headline,
    breakdown,
    matchedKeywords: out.matchedKeywords.slice(0, 20),
    missingKeywords: out.missingKeywords.slice(0, 15),
    gaps: out.gaps.slice(0, 6),
    recommendations: out.recommendations.slice(0, 8),
    job: {
      title: out.job.title || req.job.title,
      company: out.job.company || req.job.company,
      seniority: out.job.seniority,
      requiredYears: out.job.requiredYears > 0 ? out.job.requiredYears : null,
      tone: out.job.tone,
      mustHaves: out.job.mustHaves.slice(0, 6),
    },
    engine: "claude",
    generatedAt: new Date().toISOString(),
  };
}

/** Streams the cover letter text. Throws before yielding anything if the request cannot start. */
export async function* streamCoverLetterWithClaude(req: CoverLetterRequest): AsyncGenerator<string> {
  const stream = getClient().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: COVER_LETTER_SYSTEM_PROMPT,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: buildCoverLetterUserPrompt(req) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  assertUsable(final.stop_reason);
}

export async function answerQuestionsWithClaude(req: AnswersRequest): Promise<DraftAnswer[]> {
  const response = await getClient().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: ANSWERS_SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(answersOutputSchema),
    },
    messages: [{ role: "user", content: buildAnswersUserPrompt(req) }],
  });

  assertUsable(response.stop_reason);
  const out = response.parsed_output;
  if (!out) throw new ClaudeUnavailableError("The model returned unparseable answers.");

  // Re-attach by position so the UI always has exactly one answer per requested question.
  return req.questions.map((question, i) => {
    const a = out.answers[i];
    return {
      id: uid("ans"),
      question,
      answer: a?.answer ?? "",
      confidence: a?.confidence ?? "low",
      needsReview: a ? a.needsReview : true,
      engine: "claude" as const,
    };
  });
}
