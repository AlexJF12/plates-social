import { COLLECTIONS } from "../config";

// Visits (Phase 6.8) added `repo:NS.visit` to SCOPE. Sessions granted
// before that can't write visits and need to sign in again; everything else
// keeps working on them. The app only ever requests the plain form (every
// action), so that's the only one accepted.
export const hasVisitScope = (scope: string | undefined) =>
  (scope ?? "").split(" ").includes(`repo:${COLLECTIONS.visit}`);
