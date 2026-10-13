import type {
  CoverLetterTone,
  DraftAnswer,
  MatchAnalysis,
  WorkspaceJobInput,
} from "@shared/types/ai";

export type ApplicationStatus =
  | "saved"
  | "queue"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";

export interface PipelineStage {
  id: ApplicationStatus;
  label: string;
  hint: string;
}

export const PIPELINE: PipelineStage[] = [
  { id: "saved", label: "Saved", hint: "Saved for later" },
  { id: "queue", label: "In Queue", hint: "Waiting for your review" },
  { id: "applied", label: "Applied", hint: "Submitted" },
  { id: "interview", label: "Interview", hint: "Interview scheduled" },
  { id: "offer", label: "Offer", hint: "Offer received" },
  { id: "rejected", label: "Rejected", hint: "Closed" },
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  queue: "In Queue",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export type RecruiterLinkKind = "linkedin" | "email" | "posting" | "other";

export interface RecruiterLink {
  id: string;
  label: string;
  url: string;
  kind: RecruiterLinkKind;
}

export type ActivityKind = "created" | "status" | "note" | "link" | "document" | "submitted";

export interface ActivityLogEntry {
  id: string;
  kind: ActivityKind;
  message: string;
  at: string;
}

export type JobDescription = WorkspaceJobInput;

export interface Application {
  id: string;
  job: JobDescription;
  status: ApplicationStatus;
  /** CV version used for this application, pinned at creation. */
  cvVersionId: string;
  cvVersionLabel: string;
  analysis: MatchAnalysis | null;
  coverLetter: string;
  tone: CoverLetterTone;
  answers: DraftAnswer[];
  recruiterLinks: RecruiterLink[];
  notes: string;
  activity: ActivityLogEntry[];
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  /** True for seeded sample rows so they can be cleared in one click. */
  isDemo?: boolean;
}

/** Statuses an application can be created with from the workspace. */
export type CreatableStatus = Extract<ApplicationStatus, "saved" | "queue">;

export type TrackerView = "kanban" | "table";
