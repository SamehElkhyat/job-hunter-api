import type { BootstrapPayload } from "@shared/types/state";
import { HttpError } from "../utils/http-error";
import { listApplications } from "./applications.service";
import { getActiveCv, listCvVersions } from "./cv.service";
import { getDraft } from "./draft.service";
import { getProfile } from "./profile.service";

/** Everything the web app needs on first load. */
export async function buildBootstrap(): Promise<BootstrapPayload> {
  // Resolved first: on a brand-new database this creates the default CV that the list below must include.
  const active = await getActiveCv();
  if (!active) throw new HttpError(500, "Could not resolve a CV version.");
  const [cvVersions, profile, applications, workspace] = await Promise.all([
    listCvVersions(),
    getProfile(),
    listApplications(),
    getDraft(),
  ]);
  return { cvVersions, activeCvId: active._id.toString(), profile, applications, workspace };
}
