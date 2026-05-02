import { useEffect, useMemo, useState } from "react";
import type { GalleryManifest } from "../types/gallery";
import { resolveRoute } from "../lib/routes";
import { routePath } from "../lib/paths";
import { Gallery } from "./Gallery";
import { Viewer } from "./Viewer";

const RESTORE_KEY = "gallery:returnTarget";

interface GalleryHistoryState {
  galleryContextAlbumId?: string;
}

export function App() {
  const [manifest, setManifest] = useState<GalleryManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [contextAlbumId, setContextAlbumId] = useState(() => historyContextAlbumId());

  useEffect(() => {
    fetch("/gallery.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load gallery.json (${response.status})`);
        return response.json() as Promise<GalleryManifest>;
      })
      .then(setManifest)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load gallery"));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setContextAlbumId(historyContextAlbumId());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const route = useMemo(
    () => (manifest ? resolveRoute(manifest, pathname, contextAlbumId) : null),
    [contextAlbumId, manifest, pathname],
  );

  function navigate(path: string, context?: GalleryHistoryState, replace = false) {
    if (path === window.location.pathname) return;
    if (replace) {
      window.history.replaceState(context ?? null, "", path);
    } else {
      window.history.pushState(context ?? null, "", path);
    }
    setPathname(window.location.pathname);
    setContextAlbumId(historyContextAlbumId());
  }

  if (error) {
    return (
      <main className="empty-state">
        <h1>Gallery manifest missing</h1>
        <p>{error}</p>
        <p>
          Run <code>npm run process-media -- --source /path/to/source-media</code>.
        </p>
      </main>
    );
  }

  if (!manifest || !route) {
    return <main className="empty-state">Loading</main>;
  }

  const album = route.type === "media" ? route.album : route.type === "album" ? route.album : route.fallbackAlbum;
  const restoreTarget = sessionStorage.getItem(RESTORE_KEY) ?? undefined;

  return (
    <>
      <Gallery
        manifest={manifest}
        album={album}
        restoreTarget={restoreTarget}
        onRestored={() => sessionStorage.removeItem(RESTORE_KEY)}
        onNavigate={(path, context) => navigate(path, context)}
      />
      {route.type === "media" ? (
        <Viewer
          manifest={manifest}
          route={route}
          onClose={() => {
            sessionStorage.setItem(RESTORE_KEY, route.media.id);
            navigate(route.closePath);
          }}
          onOpenAlbum={(albumId) => {
            sessionStorage.setItem(RESTORE_KEY, route.media.id);
            navigate(routePath(albumId));
          }}
          onNavigate={(mediaId) => {
            sessionStorage.setItem(RESTORE_KEY, mediaId);
            navigate(routePath(mediaId), { galleryContextAlbumId: route.albumId });
          }}
        />
      ) : null}
      {route.type === "not-found" ? (
        <div className="not-found" role="status">
          This gallery link does not exist.
        </div>
      ) : null}
    </>
  );
}

function historyContextAlbumId(): string | undefined {
  return (window.history.state as GalleryHistoryState | null)?.galleryContextAlbumId;
}
