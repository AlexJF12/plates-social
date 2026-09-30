"use client";

import { useRef, useState } from "react";
import type { CookImage } from "@/lib/db/schema";
import { imageUrl } from "@/lib/image/url";

// Feed photos (§7): edge to edge, swipeable with dots when there's more than
// one. Every slide takes the first photo's shape, cropped to at most 4:5
// (portrait) so one tall photo can't take over the feed.
export function PhotoCarousel({ did, images }: { did: string; images: CookImage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const first = images[0].aspectRatio;
  const ratio = Math.max(first.width / first.height, 4 / 5);

  return (
    <div className="relative bg-sunken">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ aspectRatio: ratio }}
      >
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- already resized by our image proxy
          <img
            key={img.cid + i}
            src={imageUrl(did, img.cid, "thumb")}
            alt={img.alt ?? ""}
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center" aria-hidden>
          <div className="flex gap-1.5 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur-sm">
            {images.map((img, i) => (
              <span
                key={img.cid + i}
                className={`h-1.5 rounded-full bg-white transition-[width,opacity] duration-200 ${i === index ? "w-4" : "w-1.5 opacity-60"}`}
              />
            ))}
          </div>
        </div>
      )}
      {images.length > 1 && (
        <span className="sr-only">
          Photo {index + 1} of {images.length}
        </span>
      )}
    </div>
  );
}
