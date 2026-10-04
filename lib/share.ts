import { cookPath } from "./links";

// Sharing a cook outside the app: as a Bluesky post, or as a message (text
// share sheet). Client-safe: no server imports.

// Bluesky's app.bsky.feed.post text limit.
export const BSKY_POST_MAX_GRAPHEMES = 300;

const segmenter = new Intl.Segmenter();
const graphemes = (s: string) => Array.from(segmenter.segment(s), (g) => g.segment);
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

export const cookShareUrl = (origin: string, did: string, rkey: string) =>
  new URL(cookPath(did, rkey), origin).toString();

type ShareCook = { dishName: string; note: string | null };

// The message body for a text share: dish, then the full note, then the link.
export function messageText(cook: ShareCook, url: string) {
  return [cook.dishName, cook.note?.trim(), url].filter(Boolean).join("\n\n");
}

export type LinkFacet = {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#link"; uri: string }[];
};

// Dish, note and link in ≤ 300 graphemes. The note is cut (with "…") to fit;
// the dish name (≤ 100 graphemes) and the link are always kept whole. The
// link gets a facet (byte offsets into the UTF-8 text) so it's tappable.
export function blueskyPostText(cook: ShareCook, url: string): { text: string; facets: LinkFacet[] } {
  const head = cook.dishName.trim();
  const tail = `\n\n${url}`;
  const room = BSKY_POST_MAX_GRAPHEMES - graphemes(head).length - graphemes(tail).length;

  let body = "";
  const note = cook.note?.trim();
  // A note needs at least "\n\n" plus one grapheme and the ellipsis to be worth adding.
  if (note && room >= 4) {
    const parts = graphemes(note);
    const max = room - 2;
    body = `\n\n${parts.length <= max ? note : parts.slice(0, max - 1).join("").trimEnd() + "…"}`;
  }

  const text = head + body + tail;
  const byteEnd = utf8Length(text);
  return {
    text,
    facets: [
      {
        index: { byteStart: byteEnd - utf8Length(url), byteEnd },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
      },
    ],
  };
}

export const graphemeLength = (s: string) => graphemes(s).length;

// https://bsky.app link for a post at://did/app.bsky.feed.post/rkey.
export const bskyPostUrl = (did: string, rkey: string) => `https://bsky.app/profile/${did}/post/${rkey}`;
