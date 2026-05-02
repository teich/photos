export function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return decodeURIComponent(trimmed);
}

export function routePath(id: string): string {
  return id ? `/${id}` : "/";
}
