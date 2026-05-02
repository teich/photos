import { useEffect, useMemo, useState } from "react";
import type { GalleryManifest } from "../types/gallery";
import { resolveRoute } from "../lib/routes";
import { routePath } from "../lib/paths";
import { Gallery } from "./Gallery";
import { Viewer } from "./Viewer";

const RESTORE_KEY = "gallery:returnTarget";

export function App() {
  const [manifest, setManifest] = useState<GalleryManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathname, setPathname] = useState(() => window.location.pathname);

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
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const route = useMemo(() => (manifest ? resolveRoute(manifest, pathname) : null), [manifest, pathname]);

  function navigate(path: string, replace = false) {
    if (path === window.location.pathname) return;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setPathname(window.location.pathname);
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
        onNavigate={(path) => navigate(path)}
      />
      {route.type === "media" ? (
        <Viewer
          manifest={manifest}
          route={route}
          onClose={() => {
            sessionStorage.setItem(RESTORE_KEY, route.media.id);
            navigate(route.closePath);
          }}
          onNavigate={(mediaId) => {
            sessionStorage.setItem(RESTORE_KEY, mediaId);
            navigate(routePath(mediaId));
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
