import type { WorkspaceState } from "@shared/types/state";
import { emptyWorkspace } from "@shared/lib/workspace-defaults";
import { DraftModel, SINGLETON_KEY, type DraftRecord } from "../models";
import type { DraftInput } from "../schemas";
import { toWorkspaceDto } from "../serializers";

/** The in-progress workspace draft (single-user singleton). */

export async function getDraft(): Promise<WorkspaceState> {
  const draft = await DraftModel.findOne({ key: SINGLETON_KEY }).lean<DraftRecord>();
  return toWorkspaceDto(draft);
}

/** Replaces the draft. Upsert makes the first save and every later save the same operation. */
export async function saveDraft(workspace: DraftInput | WorkspaceState): Promise<void> {
  try {
    await DraftModel.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: { ...workspace, key: SINGLETON_KEY } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Concurrent first saves can collide on the unique key; the second attempt is a plain update.
    if ((error as { code?: number }).code !== 11000) throw error;
    await DraftModel.findOneAndUpdate({ key: SINGLETON_KEY }, { $set: { ...workspace, key: SINGLETON_KEY } }, { runValidators: true });
  }
}

export async function clearDraft(): Promise<WorkspaceState> {
  const cleared = emptyWorkspace();
  await saveDraft(cleared);
  return cleared;
}
