import { type Client, l } from "@atproto/lex";
import { AtUri, type NsidString } from "@atproto/syntax";
import { BSKY_POST } from "../config";
import { cook } from "../lexicons";
import { blueskyPostText, bskyPostUrl } from "../share";

// "Share to Bluesky": one app.bsky.feed.post in the author's own repo with
// the cook's dish name, note, photos and a link back. Only the author can
// share their cook this way, because the post reuses the photo blobs that
// are already in their repo (no re-upload). Bluesky posts aren't indexed:
// Tap only delivers NS.* and profiles, so the index stays rebuildable (§0.14).

// The OAuth session must have been granted this; sessions from before the
// scope was added haven't, and need to sign in again.
export const hasBskyPostScope = (scope: string | undefined) =>
  (scope ?? "").split(" ").some((s) => s === `repo:${BSKY_POST}?action=create` || s === `repo:${BSKY_POST}`);

export function bskyPostRecord(record: cook.Main, url: string, createdAt: string) {
  const { text, facets } = blueskyPostText({ dishName: record.dishName, note: record.note ?? null }, url);
  return {
    $type: BSKY_POST as NsidString,
    text,
    facets,
    embed: {
      $type: "app.bsky.embed.images",
      images: record.images.map((img) => ({
        image: img.image,
        alt: img.alt ?? "",
        aspectRatio: { width: img.aspectRatio.width, height: img.aspectRatio.height },
      })),
    },
    createdAt,
  };
}

// Reads the cook back from the author's PDS (the index doesn't keep blob
// sizes, and the PDS copy is the source of truth), then writes the post.
// `rkey` is a TID from the client, reused on retry: if an earlier attempt
// landed but its response was lost, the retry finds that post instead of
// creating a second one (same rule as kudos).
export async function createBskyPost(client: Client, me: string, cookRkey: string, rkey: string, url: string) {
  const uri = AtUri.make(me, BSKY_POST, rkey).toString();
  const existing = await client.getRecord(BSKY_POST, rkey).catch(() => null);
  if (!existing) {
    const { value } = await client.get(cook, { rkey: cookRkey });
    const record = bskyPostRecord(value, url, l.currentDatetimeString());
    try {
      await client.createRecord(record, rkey);
    } catch (err) {
      if (!(await client.getRecord(BSKY_POST, rkey).catch(() => null))) throw err;
    }
  }
  return { uri, url: bskyPostUrl(me, rkey) };
}
