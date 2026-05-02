import test from "node:test";
import assert from "node:assert/strict";
import { justifiedLayout } from "../src/lib/layout";
import type { GalleryTile } from "../src/types/gallery";

test("justified layout fills non-final rows", () => {
  const tiles = [tile("a", 1.5), tile("b", 1), tile("c", 1.5), tile("d", 1)];
  const layout = justifiedLayout(tiles, 600, { gap: 4, targetRowHeight: 180, minRowHeight: 120, maxRowHeight: 240 });
  assert.equal(layout.items.length, 4);
  assert.ok(layout.height > 0);

  const firstRow = layout.items.filter((item) => item.y === 0);
  const rightEdge = firstRow.at(-1)!.x + firstRow.at(-1)!.width;
  assert.ok(Math.abs(rightEdge - 600) < 0.001);
});

function tile(id: string, aspectRatio: number): GalleryTile {
  return {
    kind: "media",
    id,
    href: `/${id}`,
    title: id,
    aspectRatio,
    media: {
      id,
      albumId: "",
      slug: id,
      title: id,
      type: "image",
      sourcePath: `${id}.jpg`,
      originalFilename: `${id}.jpg`,
      contentHash: id,
      width: aspectRatio * 100,
      height: 100,
      aspectRatio,
      urls: { original: "/x.jpg", thumbnail: "/x.webp" },
    },
  };
}
