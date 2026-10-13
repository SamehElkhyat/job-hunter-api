import { SAMPLE_CV, SAMPLE_PROFILE, createDemoApplications } from "@shared/lib/sample-data";
import { SAMPLE_JOB, emptyWorkspace } from "@shared/lib/workspace-defaults";
import { ActivityLogModel, ApplicationModel, CvVersionModel, ProfileModel, SINGLETON_KEY } from "./models";
import { saveDraft } from "./services/draft.service";

/**
 * Populates a brand-new database with a sample CV, profile, draft job and demo applications.
 * Does nothing if any CV or profile already exists.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const [cvs, profile] = await Promise.all([CvVersionModel.estimatedDocumentCount(), ProfileModel.exists({ key: SINGLETON_KEY })]);
  if (cvs > 0 || profile) return false;

  const cv = await CvVersionModel.create({ label: "Full-Stack v1 (sample)", text: SAMPLE_CV });
  await ProfileModel.create({ key: SINGLETON_KEY, ...SAMPLE_PROFILE, activeCvId: cv._id });
  await saveDraft({ ...emptyWorkspace(), job: SAMPLE_JOB });

  for (const demo of createDemoApplications(cv._id.toString(), cv.label, SAMPLE_CV)) {
    const created = new Date(demo.createdAt);
    const doc = await ApplicationModel.create({
      job: demo.job,
      status: demo.status,
      cvVersionId: cv._id,
      cvVersionLabel: demo.cvVersionLabel,
      analysis: demo.analysis,
      coverLetter: demo.coverLetter,
      tone: demo.tone,
      answers: demo.answers,
      recruiterLinks: demo.recruiterLinks.map(({ label, url, kind }) => ({ label, url, kind })),
      notes: demo.notes,
      appliedAt: demo.appliedAt ? new Date(demo.appliedAt) : null,
      isDemo: true,
      createdAt: created,
      updatedAt: created,
    });
    await ActivityLogModel.insertMany(
      demo.activity.map((a) => ({ applicationId: doc._id, kind: a.kind, message: a.message, at: new Date(a.at) })),
    );
  }
  return true;
}
