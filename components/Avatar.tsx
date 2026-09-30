import type { Author } from "@/lib/db/queries";
import { imageUrl } from "@/lib/image/url";
import { displayName } from "@/lib/links";

// Profile picture through the image proxy, or the first letter of the name.
export function Avatar({ author, size }: { author: Author; size: number }) {
  const style = { width: size, height: size };
  if (author.avatarCid) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
      <img
        src={imageUrl(author.did, author.avatarCid, "avatar")}
        alt=""
        style={style}
        className="shrink-0 rounded-full bg-border object-cover"
      />
    );
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.45 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-border font-semibold text-muted uppercase"
      aria-hidden
    >
      {displayName(author).replace(/^did:\w+:/, "").charAt(0)}
    </span>
  );
}
