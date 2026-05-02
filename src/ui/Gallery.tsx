import { useEffect, useMemo, useRef, useState } from "react";
import { justifiedLayout } from "../lib/layout";
import { albumTiles } from "../lib/tiles";
import type { AlbumRecord, GalleryManifest, GalleryTile } from "../types/gallery";

interface GalleryProps {
  manifest: GalleryManifest;
  album: AlbumRecord;
  restoreTarget?: string;
  onRestored: () => void;
  onNavigate: (path: string) => void;
}

export function Gallery({ manifest, album, restoreTarget, onRestored, onNavigate }: GalleryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const tiles = useMemo(() => albumTiles(manifest, album), [manifest, album]);
  const layout = useMemo(
    () =>
      justifiedLayout(tiles, width, {
        gap: width < 680 ? 3 : 6,
        targetRowHeight: width < 680 ? 160 : 270,
        minRowHeight: width < 680 ? 118 : 170,
        maxRowHeight: width < 680 ? 240 : 390,
      }),
    [tiles, width],
  );

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!restoreTarget || layout.items.length === 0) return;
    requestAnimationFrame(() => {
      const target = ref.current?.querySelector(`[data-media-id="${CSS.escape(restoreTarget)}"]`);
      target?.scrollIntoView({ block: "center" });
      onRestored();
    });
  }, [layout.items.length, onRestored, restoreTarget]);

  return (
    <main className="gallery-shell">
      <header className="gallery-header">
        <h1>{album.title}</h1>
        {album.description ? <p>{album.description}</p> : null}
      </header>
      <div ref={ref} className="gallery-wall" style={{ height: layout.height || undefined }}>
        {layout.items.map((item) => (
          <Tile key={item.tile.id} tile={item.tile} style={item} onNavigate={onNavigate} />
        ))}
      </div>
    </main>
  );
}

interface TileProps {
  tile: GalleryTile;
  style: { x: number; y: number; width: number; height: number };
  onNavigate: (path: string) => void;
}

function Tile({ tile, style, onNavigate }: TileProps) {
  const cover = tile.kind === "album" ? tile.cover : tile.media;
  const imageUrl = cover?.urls.thumbnail || cover?.urls.poster || "";
  const videoUrl = cover?.type === "video" ? cover.urls.preview || cover.urls.original : undefined;
  const isVideo = tile.kind === "media" && tile.media.type === "video";

  return (
    <a
      href={tile.href}
      data-media-id={tile.kind === "media" ? tile.id : undefined}
      className={`gallery-tile ${tile.kind === "album" ? "album-tile" : ""}`}
      style={{
        transform: `translate3d(${style.x}px, ${style.y}px, 0)`,
        width: style.width,
        height: style.height,
      }}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(tile.href);
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" draggable="false" />
      ) : videoUrl ? (
        <video src={videoUrl} muted loop playsInline preload="metadata" />
      ) : (
        <div className="missing-cover" />
      )}
      {tile.kind === "album" ? (
        <span className="tile-overlay">
          <strong>{tile.title}</strong>
          <span>
            {tile.count} item{tile.count === 1 ? "" : "s"}
          </span>
        </span>
      ) : null}
      {isVideo ? <span className="play-badge" aria-label="Video" /> : null}
    </a>
  );
}
