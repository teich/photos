import type { AlbumRecord, GalleryManifest, GalleryTile } from "../types/gallery";
import { routePath } from "./paths";

export function albumTiles(manifest: GalleryManifest, album: AlbumRecord): GalleryTile[] {
  return album.entries
    .map((entry): GalleryTile | undefined => {
      if (entry.kind === "media") {
        const media = manifest.media[entry.id];
        if (!media) return undefined;
        return {
          kind: "media",
          id: media.id,
          href: routePath(media.id),
          title: media.title,
          aspectRatio: media.aspectRatio,
          media,
        };
      }

      const child = manifest.albums[entry.id];
      if (!child) return undefined;
      const cover = child.coverMediaId ? manifest.media[child.coverMediaId] : undefined;
      return {
        kind: "album",
        id: child.id,
        href: routePath(child.id),
        title: child.title,
        count: child.counts.media + child.counts.albums,
        aspectRatio: cover?.aspectRatio ?? 4 / 3,
        cover,
        album: child,
      };
    })
    .filter((tile): tile is GalleryTile => Boolean(tile));
}
