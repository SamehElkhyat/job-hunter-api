import type { CandidateProfile, CVVersion } from "@shared/types/cv";
import { EMPTY_PROFILE } from "@shared/types/cv";
import type { ActivityLogEntry, Application, RecruiterLink } from "@shared/types/job";
import type { WorkspaceState } from "@shared/types/state";
import { emptyWorkspace } from "@shared/lib/workspace-defaults";
import type { ActivityLogRecord, ApplicationRecord, CvVersionRecord, DraftRecord, ProfileRecord } from "./models";

/**
 * Converts Mongoose records (ObjectIds, Dates) to the plain JSON shapes the web app consumes
 * (string ids, ISO dates). Everything crossing the API boundary goes through here.
 */

const iso = (d: Date | null | undefined): string => (d ? new Date(d).toISOString() : new Date(0).toISOString());

export function toCvDto(cv: CvVersionRecord): CVVersion {
  return {
    id: cv._id.toString(),
    label: cv.label,
    text: cv.text,
    createdAt: iso(cv.createdAt),
    updatedAt: iso(cv.updatedAt),
  };
}

export function toProfileDto(profile: Partial<ProfileRecord> | null): CandidateProfile {
  const dto = { ...EMPTY_PROFILE };
  if (!profile) return dto;
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof CandidateProfile)[]) {
    const value = profile[key];
    if (value !== undefined && value !== null) (dto as Record<string, unknown>)[key] = value;
  }
  return dto;
}

export function toWorkspaceDto(draft: DraftRecord | null): WorkspaceState {
  const base = emptyWorkspace();
  if (!draft) return base;
  return {
    job: {
      title: draft.job?.title ?? "",
      company: draft.job?.company ?? "",
      location: draft.job?.location ?? "",
      url: draft.job?.url ?? "",
      description: draft.job?.description ?? "",
    },
    tone: draft.tone ?? base.tone,
    instructions: draft.instructions ?? "",
    analysis: draft.analysis ?? null,
    coverLetter: draft.coverLetter ?? "",
    coverLetterEngine: draft.coverLetterEngine ?? null,
    questions: draft.questions ?? base.questions,
    answers: (draft.answers ?? []).map((a) => ({
      id: a.id,
      question: a.question,
      answer: a.answer,
      confidence: a.confidence,
      needsReview: a.needsReview,
      engine: a.engine,
    })),
    analysedCvId: draft.analysedCvId ?? null,
  };
}

export function toActivityDto(log: ActivityLogRecord): ActivityLogEntry {
  return { id: log._id.toString(), kind: log.kind, message: log.message, at: iso(log.at) };
}

export function toApplicationDto(app: ApplicationRecord, logs: ActivityLogRecord[]): Application {
  const links: RecruiterLink[] = (app.recruiterLinks ?? []).map((l) => ({
    id: l._id?.toString() ?? "",
    label: l.label,
    url: l.url,
    kind: l.kind,
  }));
  return {
    id: app._id.toString(),
    job: {
      title: app.job.title,
      company: app.job.company ?? "",
      location: app.job.location ?? "",
      url: app.job.url ?? "",
      description: app.job.description ?? "",
    },
    status: app.status,
    cvVersionId: app.cvVersionId ? app.cvVersionId.toString() : "",
    cvVersionLabel: app.cvVersionLabel,
    analysis: app.analysis ?? null,
    coverLetter: app.coverLetter,
    tone: app.tone,
    answers: (app.answers ?? []).map((a) => ({
      id: a.id,
      question: a.question,
      answer: a.answer,
      confidence: a.confidence,
      needsReview: a.needsReview,
      engine: a.engine,
    })),
    recruiterLinks: links,
    notes: app.notes,
    activity: logs.map(toActivityDto),
    createdAt: iso(app.createdAt),
    updatedAt: iso(app.updatedAt),
    appliedAt: app.appliedAt ? iso(app.appliedAt) : null,
    isDemo: app.isDemo || undefined,
  };
}
