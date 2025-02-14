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
 * Layout a single row of items
 */
function layoutRow(
  items: MediaItem[],
  options: LayoutOptions
): LayoutRow {
  const { containerWidth, spacing, targetRowHeight } = options;
  
  // Calculate total aspect ratio for the row, using a default of 1 for items without dimensions
  const totalAspectRatio = items.reduce((sum, item) => {
    // If no dimensions, assume a square aspect ratio
    const aspectRatio = item.dimensions?.aspectRatio ?? 1;
    // Give more weight to portrait images
    const weight = aspectRatio < 1 ? 1.5 : 1;
    return sum + (aspectRatio * weight);
  }, 0);

  // Calculate row height and base widths
  const availableWidth = spacing > 0 
    ? containerWidth - ((items.length - 1) * spacing)
    : containerWidth;
  let rowHeight = availableWidth / totalAspectRatio;

  // Ensure row height doesn't exceed target for portrait images
  const hasPortrait = items.some(item => (item.dimensions?.aspectRatio || 1) < 1);
  if (hasPortrait) {
    rowHeight = Math.min(rowHeight, targetRowHeight * 1.5);
  }

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
 * Calculate optimal layout for items
 */
function calculateLayout(
  items: MediaItem[],
  options: LayoutOptions
): LayoutRow[] {
  const { containerWidth, targetRowHeight, spacing, tolerance } = options;
  const bestLayout: LayoutRow[] = [];
  
  // Create a copy of items to prevent modifying original
  const workingItems = [...items];
  const usedItems = new Set<string>();
  
  // Process items into rows
  let startIndex = 0;
  while (startIndex < workingItems.length) {
    const currentRow: MediaItem[] = [];
    let currentWidth = 0;
    
    // Add items to row while tracking width
    for (let i = startIndex; i < workingItems.length; i++) {
      const item = workingItems[i];
      const aspectRatio = item.dimensions?.aspectRatio || 1;
      const itemWidth = targetRowHeight * aspectRatio;
      
      // Add spacing between items (but not for the first item)
      if (currentWidth > 0 && spacing > 0) {
        currentWidth += spacing;
      }
      currentWidth += itemWidth;
      
      // Check if row is full, but be more lenient with portrait images
      const isPortrait = aspectRatio < 1;
      const adjustedTolerance = isPortrait ? tolerance * 2 : tolerance;
      if (currentWidth > containerWidth + adjustedTolerance) {
        break;
      }
      
      // Skip if this item has already been used
      if (usedItems.has(item.id)) {
        continue;
      }

      // Always add the item to the row - we'll handle seams visually with CSS
      currentRow.push(item);
      usedItems.add(item.id);
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
  return useMemo(() => {
    const layoutOptions: LayoutOptions = {
      containerWidth,
      targetRowHeight: options.targetRowHeight || 300,
      spacing: options.spacing || 8,
      tolerance: options.tolerance || 20
    };

    // Calculate layout with all items, using default aspect ratio for those without dimensions
    const rows = calculateLayout(items, layoutOptions);
    
    return {
      rows,
      totalHeight: rows.reduce((sum, row) => sum + row.height, 0)
    };
  }, [items, containerWidth, options]);
}
