import type { MatchVerdict, ScoreBreakdown } from "@shared/types/ai";
import { clamp } from "@shared/lib/utils";

/** Weight of each category in the overall ATS score. Must sum to 1. */
export const SCORE_WEIGHTS = {
  hardSkills: 0.35,
  tools: 0.25,
  experience: 0.25,
  softSkills: 0.15,
} as const;

export function computeOverallScore(breakdown: ScoreBreakdown): number {
  const total =
    breakdown.hardSkills.score * SCORE_WEIGHTS.hardSkills +
    breakdown.tools.score * SCORE_WEIGHTS.tools +
    breakdown.experience.score * SCORE_WEIGHTS.experience +
    breakdown.softSkills.score * SCORE_WEIGHTS.softSkills;
  return Math.round(clamp(total, 0, 100));
}

export function verdictFor(score: number): MatchVerdict {
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "weak";
}

export const VERDICT_COPY: Record<MatchVerdict, { label: string; advice: string }> = {
  excellent: { label: "Excellent match", advice: "Apply now. Your CV already speaks this job's language." },
  strong: { label: "Strong match", advice: "Worth applying. A few keyword tweaks will lift you into the top tier." },
  moderate: { label: "Moderate match", advice: "Close the critical gaps below before you apply." },
  weak: { label: "Weak match", advice: "Significant gaps. Apply only if you can address them honestly." },
};
