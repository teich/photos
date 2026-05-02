import { useEffect, useRef } from "react";
import type { ResolvedRoute } from "../lib/routes";
import type { GalleryManifest } from "../types/gallery";

interface ViewerProps {
  manifest: GalleryManifest;
  route: Extract<ResolvedRoute, { type: "media" }>;
  onClose: () => void;
  onNavigate: (mediaId: string) => void;
}

export function Viewer({ manifest, route, onClose, onNavigate }: ViewerProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { media } = route;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && route.previousId) onNavigate(route.previousId);
      if (event.key === "ArrowRight" && route.nextId) onNavigate(route.nextId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onNavigate, route.nextId, route.previousId]);

  function finishTouch(x: number, y: number) {
    if (!touchStart.current) return;
    const deltaX = x - touchStart.current.x;
    const deltaY = y - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX > 0 && route.previousId) onNavigate(route.previousId);
    if (deltaX < 0 && route.nextId) onNavigate(route.nextId);
  }

  return (
    <section
      className="viewer"
      aria-modal="true"
      role="dialog"
      onTouchStart={(event) => {
        const touch = event.changedTouches.item(0);
        if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches.item(0);
        if (touch) finishTouch(touch.clientX, touch.clientY);
      }}
    >
      <button className="viewer-close" type="button" aria-label="Close" onClick={onClose}>
        x
      </button>
      {route.previousId ? (
        <button className="viewer-nav previous" type="button" aria-label="Previous" onClick={() => onNavigate(route.previousId!)}>
          &lsaquo;
        </button>
      ) : null}
      <figure className="viewer-stage">
        {media.type === "image" ? (
          <img src={media.urls.original} alt={media.title} />
        ) : (
          <video src={media.urls.original} poster={media.urls.poster || media.urls.thumbnail} controls autoPlay playsInline />
        )}
        {media.caption ? <figcaption>{media.caption}</figcaption> : null}
      </figure>
      {route.nextId ? (
        <button className="viewer-nav next" type="button" aria-label="Next" onClick={() => onNavigate(route.nextId!)}>
          &rsaquo;
        </button>
      ) : null}
      <div className="viewer-counter">
        {media.title}
        {manifest.albums[media.albumId]?.title ? <span>{manifest.albums[media.albumId].title}</span> : null}
      </div>
    </section>
  );
}
