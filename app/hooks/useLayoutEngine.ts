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
  const { containerWidth, spacing } = options;
  
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
 * Check if two images have similar aspect ratios (would create a visual seam)
 */
function hasSimilarAspectRatio(a: MediaItem, b: MediaItem, threshold = 0.2): boolean {
  const aRatio = a.dimensions?.aspectRatio || 1;
  const bRatio = b.dimensions?.aspectRatio || 1;
  return Math.abs(aRatio - bRatio) < threshold;
}

/**
 * Find the best swap candidate in a row to break a vertical seam
 */
function findSwapCandidate(
  currentRow: MediaItem[],
  previousRow: MediaItem[],
  currentIndex: number
): number {
  let bestSwapIndex = -1;
  let leastSimilar = Number.MAX_VALUE;

  // Try to find an image that's least similar to the one we're trying to avoid aligning with
  for (let i = 0; i < currentRow.length; i++) {
    if (i === currentIndex) continue;
    
    const similarity = Math.abs(
      (previousRow[currentIndex].dimensions?.aspectRatio || 1) -
      (currentRow[i].dimensions?.aspectRatio || 1)
    );
    
    if (similarity > leastSimilar) {
      leastSimilar = similarity;
      bestSwapIndex = i;
    }
  }

  return bestSwapIndex;
}

/**
 * Try different row arrangements to find optimal layout
 */
function calculateLayout(
  items: MediaItem[],
  options: LayoutOptions
): LayoutRow[] {
  const { containerWidth, targetRowHeight, spacing, tolerance } = options;
  const bestLayout: LayoutRow[] = [];
  let previousRow: MediaItem[] | null = null;
  
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
      
      // Check if row is full
      if (currentWidth > containerWidth + tolerance) {
        break;
      }
      
      // Skip if this item has already been used
      if (usedItems.has(item.id)) {
        continue;
      }

      // Before adding to row, check if this would create a vertical seam
      if (previousRow && currentRow.length < previousRow.length) {
        const prevIndex = currentRow.length;
        if (hasSimilarAspectRatio(item, previousRow[prevIndex])) {
          // Look ahead for a better candidate to swap with
          let foundSwap = false;
          for (let j = i + 1; j < Math.min(workingItems.length, i + 3); j++) {
            const nextItem = workingItems[j];
            if (!usedItems.has(nextItem.id) && !hasSimilarAspectRatio(nextItem, previousRow[prevIndex])) {
              // Swap items to avoid the seam
              [workingItems[i], workingItems[j]] = [workingItems[j], workingItems[i]];
              foundSwap = true;
              break;
            }
          }
          // If no swap was found, just use the current item
          if (!foundSwap) {
            currentRow.push(item);
            usedItems.add(item.id);
          }
        } else {
          currentRow.push(item);
          usedItems.add(item.id);
        }
      } else {
        currentRow.push(item);
        usedItems.add(item.id);
      }
    }

    // Layout the row
    if (currentRow.length > 0) {
      const row = layoutRow(currentRow, options);
      bestLayout.push(row);
      previousRow = currentRow;
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

    // Filter items without dimensions
    const validItems = items.filter(item => item.dimensions?.aspectRatio);
    
    // Calculate layout
    const rows = calculateLayout(validItems, layoutOptions);
    
    return {
      rows,
      totalHeight: rows.reduce((sum, row) => sum + row.height, 0)
    };
  }, [items, containerWidth, options]);
}
