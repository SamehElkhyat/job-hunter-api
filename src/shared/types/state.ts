import type {
  CoverLetterTone,
  DraftAnswer,
  MatchAnalysis,
  WorkspaceJobInput,
} from "@shared/types/ai";
import type { CandidateProfile, CVVersion } from "@shared/types/cv";
import type { Application } from "@shared/types/job";

/** The in-progress job/analysis/cover-letter the user is working on. Persisted server-side as a draft. */
export interface WorkspaceState {
  job: WorkspaceJobInput;
  tone: CoverLetterTone;
  instructions: string;
  analysis: MatchAnalysis | null;
  coverLetter: string;
  coverLetterEngine: "claude" | "local" | null;
  questions: string[];
  answers: DraftAnswer[];
  /** Id of the CV version the current analysis was run against. */
  analysedCvId: string | null;
}

/** Everything the UI needs on first load, returned by GET /api/bootstrap. */
export interface BootstrapPayload {
  cvVersions: CVVersion[];
  activeCvId: string;
  profile: CandidateProfile;
  applications: Application[];
  workspace: WorkspaceState;
}
