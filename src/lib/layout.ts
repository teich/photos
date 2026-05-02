import type { GalleryTile } from "../types/gallery";

export interface LayoutOptions {
  gap: number;
  targetRowHeight: number;
  minRowHeight: number;
  maxRowHeight: number;
}

export interface LayoutItem {
  tile: GalleryTile;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  items: LayoutItem[];
  height: number;
}

const DEFAULTS: LayoutOptions = {
  gap: 6,
  targetRowHeight: 260,
  minRowHeight: 170,
  maxRowHeight: 380,
};

export function justifiedLayout(
  tiles: GalleryTile[],
  containerWidth: number,
  options: Partial<LayoutOptions> = {},
): LayoutResult {
  const config = { ...DEFAULTS, ...options };
  if (containerWidth <= 0 || tiles.length === 0) {
    return { items: [], height: 0 };
  }

  const rows: GalleryTile[][] = [];
  let current: GalleryTile[] = [];
  let ratioSum = 0;

  for (const tile of tiles) {
    const ratio = clampRatio(tile.aspectRatio);
    current.push(tile);
    ratioSum += ratio;

    const widthAtTarget = ratioSum * config.targetRowHeight + config.gap * (current.length - 1);
    if (widthAtTarget >= containerWidth || ratio > 2.8) {
      rows.push(current);
      current = [];
      ratioSum = 0;
    }
  }

  if (current.length > 0) {
    rows.push(current);
  }

  const items: LayoutItem[] = [];
  let y = 0;

  rows.forEach((row, rowIndex) => {
    const isFinalRow = rowIndex === rows.length - 1;
    const rowRatioSum = row.reduce((sum, tile) => sum + clampRatio(tile.aspectRatio), 0);
    const availableWidth = containerWidth - config.gap * (row.length - 1);
    const justifiedHeight = availableWidth / rowRatioSum;
    const height = isFinalRow
      ? Math.min(config.targetRowHeight, Math.max(config.minRowHeight, justifiedHeight))
      : Math.min(config.maxRowHeight, Math.max(config.minRowHeight, justifiedHeight));

    let x = 0;
    row.forEach((tile, itemIndex) => {
      const isLast = itemIndex === row.length - 1;
      const width = isLast && !isFinalRow ? containerWidth - x : clampRatio(tile.aspectRatio) * height;
      items.push({ tile, x, y, width, height });
      x += width + config.gap;
    });

    y += height + config.gap;
  });

  return { items, height: Math.max(0, y - config.gap) };
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 4 / 3;
  }
  return Math.min(4.5, Math.max(0.35, ratio));
}
