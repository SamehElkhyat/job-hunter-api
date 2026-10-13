/** Which engine produced a result. "local" is the deterministic built-in engine. */
export type AIEngine = "claude" | "local";

export type KeywordImportance = "critical" | "important" | "nice";
export type GapSeverity = "critical" | "moderate" | "minor";
export type ImpactLevel = "high" | "medium" | "low";
export type SeniorityLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "lead"
  | "unspecified";

export type CVSection = "summary" | "skills" | "experience" | "projects" | "education" | "headline";

export interface ScoreCategory {
  /** 0-100. */
  score: number;
  /** One or two sentences explaining the score. */
  summary: string;
  matched: string[];
  missing: string[];
}

export interface ScoreBreakdown {
  hardSkills: ScoreCategory;
  softSkills: ScoreCategory;
  experience: ScoreCategory;
  tools: ScoreCategory;
}

export interface MissingKeyword {
  keyword: string;
  importance: KeywordImportance;
  /** Where the user could truthfully weave this keyword into the CV. */
  suggestion: string;
}

export interface CriticalGap {
  title: string;
  severity: GapSeverity;
  detail: string;
}

export interface Recommendation {
  title: string;
  detail: string;
  impact: ImpactLevel;
  section: CVSection;
}

export interface JobMeta {
  title: string;
  company: string;
  seniority: SeniorityLevel;
  /** Years of experience the JD asks for, if stated. */
  requiredYears: number | null;
  /** Short description of the company/team tone inferred from the JD. */
  tone: string;
  /** The 3-6 most important responsibilities or must-haves. */
  mustHaves: string[];
}

export type MatchVerdict = "excellent" | "strong" | "moderate" | "weak";

export interface MatchAnalysis {
  /** 0-100, computed from the weighted breakdown. */
  overallScore: number;
  verdict: MatchVerdict;
  headline: string;
  breakdown: ScoreBreakdown;
  matchedKeywords: string[];
  missingKeywords: MissingKeyword[];
  gaps: CriticalGap[];
  recommendations: Recommendation[];
  job: JobMeta;
  engine: AIEngine;
  generatedAt: string;
}

export type CoverLetterTone = "professional" | "confident" | "startup" | "technical";

export interface ToneOption {
  id: CoverLetterTone;
  label: string;
  description: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  { id: "professional", label: "Professional", description: "Polished, warm and measured." },
  { id: "confident", label: "Confident", description: "Assertive, outcome-led, no hedging." },
  { id: "startup", label: "Startup / Direct", description: "Short, human, zero corporate filler." },
  { id: "technical", label: "Technical", description: "Architecture, trade-offs and specifics." },
];

export interface DraftAnswer {
  id: string;
  question: string;
  answer: string;
  /** "high" when derived from explicit profile/CV facts, "low" when the model had to infer. */
  confidence: "high" | "medium" | "low";
  /** Set when the user should double check the answer before submitting. */
  needsReview: boolean;
  engine: AIEngine;
}

export interface WorkspaceJobInput {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}

export interface AnalyzeRequest {
  cvText: string;
  job: WorkspaceJobInput;
}

export interface CoverLetterRequest {
  cvText: string;
  job: WorkspaceJobInput;
  tone: CoverLetterTone;
  candidateName: string;
  analysis: MatchAnalysis | null;
  /** Extra steer from the user, e.g. "mention my open-source work". */
  instructions: string;
}

export interface AnswersRequest {
  cvText: string;
  job: WorkspaceJobInput;
  profileFacts: Record<string, string>;
  questions: string[];
}

export interface AIStatus {
  aiEnabled: boolean;
  model: string | null;
}
