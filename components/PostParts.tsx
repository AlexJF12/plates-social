import Link from "next/link";
import type { Author } from "@/lib/db/queries";
import type { CookImage } from "@/lib/db/schema";
import { imageUrl } from "@/lib/image/url";
import { profilePath } from "@/lib/links";

// Pieces shared by the cook and visit pages.

// The author as a profile link, or plain text when signed out (profiles
// need sign-in).
export function AuthorLink({ author, className, children }: {
  author: Author | null;
  className: string;
  children: React.ReactNode;
}) {
  if (!author) return <span className={className}>{children}</span>;
  return (
    <Link href={profilePath(author)} className={className}>
      {children}
    </Link>
  );
}

// Every photo at its full aspect ratio (§7: detail pages don't crop).
export function FullPhotos({ did, images }: { did: string; images: CookImage[] }) {
  return (
    <div className="space-y-1">
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
        <img
          key={img.cid + i}
          src={imageUrl(did, img.cid, "full")}
          alt={img.alt ?? ""}
          width={img.aspectRatio.width}
          height={img.aspectRatio.height}
          loading={i === 0 ? "eager" : "lazy"}
          className="h-auto w-full bg-sunken"
          style={{ aspectRatio: `${img.aspectRatio.width} / ${img.aspectRatio.height}` }}
        />
      ))}
    </div>
  );
}
