export type EntryKind = "media" | "album";
export type MediaKind = "image" | "video";

export interface GalleryManifest {
  schemaVersion: 1;
  generatedAt: string;
  title: string;
  rootAlbumId: string;
  albums: Record<string, AlbumRecord>;
  media: Record<string, MediaRecord>;
}

export interface AlbumRecord {
  id: string;
  path: string;
  slug: string;
  title: string;
  description?: string;
  coverMediaId?: string;
  entries: GalleryEntry[];
  counts: {
    albums: number;
    media: number;
    images: number;
    videos: number;
  };
}

export interface GalleryEntry {
  kind: EntryKind;
  id: string;
}

export interface MediaRecord {
  id: string;
  albumId: string;
  slug: string;
  title: string;
  caption?: string;
  type: MediaKind;
  sourcePath: string;
  originalFilename: string;
  contentHash: string;
  width: number;
  height: number;
  aspectRatio: number;
  captureDate?: string;
  urls: {
    original: string;
    thumbnail: string;
    preview?: string;
    poster?: string;
  };
}

export type GalleryTile =
  | {
      kind: "media";
      id: string;
      href: string;
      title: string;
      aspectRatio: number;
      media: MediaRecord;
    }
  | {
      kind: "album";
      id: string;
      href: string;
      title: string;
      count: number;
      aspectRatio: number;
      cover?: MediaRecord;
      album: AlbumRecord;
    };
