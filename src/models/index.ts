export * from "./constants";
export * from "./ActivityLog";
export * from "./Application";
export * from "./CvVersion";
export * from "./Draft";
export * from "./Profile";

import { ActivityLogModel } from "./ActivityLog";
import { ApplicationModel } from "./Application";
import { CvVersionModel } from "./CvVersion";
import { DraftModel } from "./Draft";
import { ProfileModel } from "./Profile";

/** Creates every collection's indexes up front (also gives a clear error if the DB rejects them). */
export async function syncIndexes(): Promise<void> {
  await Promise.all([
    ActivityLogModel.createIndexes(),
    ApplicationModel.createIndexes(),
    CvVersionModel.createIndexes(),
    DraftModel.createIndexes(),
    ProfileModel.createIndexes(),
  ]);
}
