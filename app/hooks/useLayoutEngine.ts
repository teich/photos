import { useMemo } from 'react';
import { MediaItem } from '@/lib/media';

interface LayoutItem extends MediaItem {
  width: number;
  height: number;
}

interface LayoutRow {
  items: LayoutItem[];
  height: number;
}

interface LayoutOptions {
  containerWidth: number;
  targetRowHeight: number;
  spacing: number;
  tolerance: number;
}

/**
 * Calculate layout score based on how well rows match target height
 */
function calculateLayoutScore(rows: LayoutRow[], targetHeight: number): number {
  return rows.reduce((score, row) => {
    const heightDiff = Math.abs(row.height - targetHeight);
    return score + heightDiff;
  }, 0);
}

/**
 * Layout a single row of items
 */
function layoutRow(
  items: MediaItem[],
  options: LayoutOptions
): LayoutRow {
  const { containerWidth, targetRowHeight, spacing } = options;
  
  // Calculate total aspect ratio for the row
  const totalAspectRatio = items.reduce((sum, item) => {
    return sum + (item.dimensions?.aspectRatio || 1);
  }, 0);

  // Calculate row height and base widths
  const availableWidth = spacing > 0 
    ? containerWidth - ((items.length - 1) * spacing)
    : containerWidth;
  const rowHeight = availableWidth / totalAspectRatio;

  // Calculate base item dimensions
  const layoutItems: LayoutItem[] = items.map(item => {
    const aspectRatio = item.dimensions?.aspectRatio || 1;
    const width = rowHeight * aspectRatio;
    return {
      ...item,
      width,
      height: rowHeight
    };
  });

  // Ensure exact container width by adjusting widths proportionally
  const totalCalculatedWidth = layoutItems.reduce((sum, item) => sum + item.width, 0);
  const scaleFactor = containerWidth / totalCalculatedWidth;
  
  layoutItems.forEach(item => {
    item.width *= scaleFactor;
  });

  return {
    items: layoutItems,
    height: rowHeight
  };
}

/**
 * Try different row arrangements to find optimal layout
 */
function calculateLayout(
  items: MediaItem[],
  options: LayoutOptions
): LayoutRow[] {
  const { containerWidth, targetRowHeight, spacing, tolerance } = options;
  
  let bestLayout: LayoutRow[] = [];
  let bestScore = Infinity;

  // Try different numbers of items per row
  let startIndex = 0;
  while (startIndex < items.length) {
    let currentRow: MediaItem[] = [];
    let currentWidth = 0;
    
    // Add items to row while tracking width
    for (let i = startIndex; i < items.length; i++) {
      const item = items[i];
      const aspectRatio = item.dimensions?.aspectRatio || 1;
      const itemWidth = targetRowHeight * aspectRatio;
      
      // Add spacing between items (but not for the first item)
      if (currentWidth > 0 && spacing > 0) {
        currentWidth += spacing;
      }
      currentWidth += itemWidth;
      
      // Check if row is full
      if (currentWidth > containerWidth + tolerance) {
        break;
      }
      
      currentRow.push(item);
    }

    // Layout the row
    if (currentRow.length > 0) {
      const row = layoutRow(currentRow, options);
      bestLayout.push(row);
      startIndex += currentRow.length;
    } else {
      // Prevent infinite loop if we can't fit any items
      startIndex++;
    }
  }

  return bestLayout;
}

/**
 * Custom hook for calculating optimal media layout
 */
export function useLayoutEngine(
  items: MediaItem[],
  containerWidth: number,
  options: Partial<LayoutOptions> = {}
) {
  const layoutOptions: LayoutOptions = {
    containerWidth,
    targetRowHeight: options.targetRowHeight || 300,
    spacing: options.spacing || 8,
    tolerance: options.tolerance || 20
  };

  return useMemo(() => {
    // Filter items without dimensions
    const validItems = items.filter(item => item.dimensions?.aspectRatio);
    
    // Calculate layout
    const rows = calculateLayout(validItems, layoutOptions);
    
    return {
      rows,
      totalHeight: rows.reduce((sum, row) => sum + row.height, 0)
    };
  }, [items, containerWidth, layoutOptions.targetRowHeight, layoutOptions.spacing, layoutOptions.tolerance]);
}
