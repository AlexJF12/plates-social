import { Tap } from "@atproto/tap";

let _tap: Tap | null = null;

export const getTap = (): Tap => {
  if (!_tap) {
    _tap = new Tap(process.env.TAP_URL || "http://127.0.0.1:2480", {
      adminPassword: process.env.TAP_ADMIN_PASSWORD || undefined,
    });
  }
  return _tap;
};
