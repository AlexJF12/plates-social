// URL for an image served by the proxy (app/api/img). Safe to import from
// client components.
export type ImageSize = "avatar" | "thumb" | "full";

export const imageUrl = (did: string, cid: string, size: ImageSize) =>
  `/api/img/${encodeURIComponent(did)}/${cid}?size=${size}`;
