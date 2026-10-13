import { Router } from "express";
import * as ai from "../controllers/ai.controller";
import * as applications from "../controllers/applications.controller";
import { getBootstrap, getHealth } from "../controllers/bootstrap.controller";
import * as cv from "../controllers/cv.controller";
import * as draft from "../controllers/draft.controller";
import * as profile from "../controllers/profile.controller";
import { requireDatabase } from "../middleware/database";

/** Stateless AI endpoints (no database access). */
export function aiRouter(): Router {
  const router = Router();
  router.get("/status", ai.status);
  router.post("/analyze", ai.analyze);
  router.post("/answers", ai.answers);
  router.post("/cover-letter", ai.coverLetter);
  return router;
}

/** Endpoints backed by MongoDB. */
export function dataRouter(): Router {
  const router = Router();
  router.use(requireDatabase);

  router.get("/bootstrap", getBootstrap);

  router.post("/cv-versions", cv.createCv);
  router.put("/cv-versions/active", cv.setActiveCv);
  router.patch("/cv-versions/:id", cv.patchCv);
  router.post("/cv-versions/:id/duplicate", cv.duplicateCv);
  router.delete("/cv-versions/:id", cv.deleteCv);

  router.get("/profile", profile.readProfile);
  router.patch("/profile", profile.updateProfile);

  router.get("/workspace", draft.readDraft);
  router.put("/workspace", draft.replaceDraft);
  router.delete("/workspace", draft.resetDraft);

  router.get("/applications", applications.list);
  router.post("/applications", applications.create);
  router.delete("/applications", applications.removeDemo);
  router.get("/applications/:id", applications.read);
  router.patch("/applications/:id", applications.patch);
  router.delete("/applications/:id", applications.remove);
  router.post("/applications/:id/move", applications.move);
  router.post("/applications/:id/submit", applications.submit);
  router.post("/applications/:id/activity", applications.logActivity);
  router.post("/applications/:id/links", applications.addLink);
  router.delete("/applications/:id/links/:linkId", applications.removeLink);

  return router;
}

export { getHealth };
