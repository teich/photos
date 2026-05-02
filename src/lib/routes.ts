import type { AlbumRecord, GalleryManifest, MediaRecord } from "../types/gallery";
import { normalizePathname, routePath } from "./paths";

export type ResolvedRoute =
  | {
      type: "album";
      album: AlbumRecord;
      albumId: string;
    }
  | {
      type: "media";
      media: MediaRecord;
      album: AlbumRecord;
      albumId: string;
      previousId?: string;
      nextId?: string;
      closePath: string;
    }
  | {
      type: "not-found";
      path: string;
      fallbackAlbum: AlbumRecord;
    };

export function resolveRoute(manifest: GalleryManifest, pathname: string): ResolvedRoute {
  const path = normalizePathname(pathname);

  const album = manifest.albums[path];
  if (album) {
    return { type: "album", album, albumId: album.id };
  }

  const media = manifest.media[path];
  if (media) {
    const owner = manifest.albums[media.albumId] ?? manifest.albums[manifest.rootAlbumId];
    const mediaEntries = owner.entries.filter((entry) => entry.kind === "media");
    const index = mediaEntries.findIndex((entry) => entry.id === media.id);

    return {
      type: "media",
      media,
      album: owner,
      albumId: owner.id,
      previousId: index > 0 ? mediaEntries[index - 1]?.id : undefined,
      nextId: index >= 0 && index < mediaEntries.length - 1 ? mediaEntries[index + 1]?.id : undefined,
      closePath: routePath(owner.id),
    };
  }

  return {
    type: "not-found",
    path,
    fallbackAlbum: manifest.albums[manifest.rootAlbumId],
  };
}
