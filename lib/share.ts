import { cookPath, visitPath } from "./links";

// Sharing a cook or a visit outside the app: as a Bluesky post, or as a
// message (text share sheet). Client-safe: no server imports.

// Bluesky's app.bsky.feed.post text limit.
export const BSKY_POST_MAX_GRAPHEMES = 300;

const segmenter = new Intl.Segmenter();
const graphemes = (s: string) => Array.from(segmenter.segment(s), (g) => g.segment);
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

export const cookShareUrl = (origin: string, did: string, rkey: string) =>
  new URL(cookPath(did, rkey), origin).toString();

export const visitShareUrl = (origin: string, did: string, rkey: string) =>
  new URL(visitPath(did, rkey), origin).toString();

// What a share says: a title that's always kept whole, and a body that may
// be cut to fit.
export type ShareText = { title: string; body: string | null };

export const cookShareText = (cook: { dishName: string; note: string | null }): ShareText => ({
  title: cook.dishName.trim(),
  body: cook.note,
});

// "★★★★☆" for 4 out of 5.
export const starsText = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

// "Lilia, Brooklyn" then the stars on the next line, then the review.
export const visitShareText = (visit: {
  restaurantName: string;
  restaurantArea: string | null;
  rating: number;
  review: string | null;
}): ShareText => ({
  title: `${[visit.restaurantName.trim(), visit.restaurantArea?.trim()].filter(Boolean).join(", ")}\n${starsText(visit.rating)}`,
  body: visit.review,
});

// The message body for a text share: title, then the full body, then the link.
export function messageText(share: ShareText, url: string) {
  return [share.title, share.body?.trim(), url].filter(Boolean).join("\n\n");
}

export type LinkFacet = {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#link"; uri: string }[];
};

// Title, body and link in ≤ 300 graphemes. The body is cut (with "…") to
// fit; the title (a dish name, or a restaurant, area and stars: ≤ 208
// graphemes) and the link are always kept whole. The link gets a facet
// (byte offsets into the UTF-8 text) so it's tappable.
export function blueskyPostText(share: ShareText, url: string): { text: string; facets: LinkFacet[] } {
  const head = share.title;
  const tail = `\n\n${url}`;
  const room = BSKY_POST_MAX_GRAPHEMES - graphemes(head).length - graphemes(tail).length;

  let body = "";
  const note = share.body?.trim();
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
