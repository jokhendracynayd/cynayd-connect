export interface NonSplitLayoutConfig {
  gridClasses: string;
  autoRowsClass: string;
  tileBaseClass: string;
  tileClassForIndex?: (index: number) => string;
}

// Minimum dimensions for proper video visibility (similar to Zoom/Teams)
const MIN_TILE_WIDTH = 320;
const MIN_TILE_HEIGHT = 240;

export interface OptimalLayoutResult {
  layoutType: 'dynamic' | 'grid';
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Calculate optimal layout based on participant count and available space
 * Returns dynamic layout if tiles can fit with minimum dimensions, otherwise grid layout
 */
export function calculateOptimalLayout(
  count: number,
  availableWidth: number,
  availableHeight: number,
  gap: number = 16
): OptimalLayoutResult {
  if (count <= 0) {
    return {
      layoutType: 'grid',
      columns: 1,
      rows: 1,
      tileWidth: 0,
      tileHeight: 0,
    };
  }

  if (count === 1) {
    return {
      layoutType: 'dynamic',
      columns: 1,
      rows: 1,
      tileWidth: availableWidth,
      tileHeight: availableHeight,
    };
  }

  // Try different grid configurations
  let bestLayout: OptimalLayoutResult | null = null;
  let maxTileSize = 0;

  // Try configurations from 2x2 up to 4x4 (16 tiles)
  for (let cols = 1; cols <= 4; cols++) {
    for (let rows = 1; rows <= 4; rows++) {
      const totalTiles = cols * rows;
      if (totalTiles < count) continue; // Need enough tiles

      const totalGapWidth = (cols - 1) * gap;
      const totalGapHeight = (rows - 1) * gap;
      const tileWidth = (availableWidth - totalGapWidth) / cols;
      const tileHeight = (availableHeight - totalGapHeight) / rows;

      // Check if tiles meet minimum dimensions
      if (tileWidth >= MIN_TILE_WIDTH && tileHeight >= MIN_TILE_HEIGHT) {
        const tileSize = tileWidth * tileHeight;
        if (tileSize > maxTileSize) {
          maxTileSize = tileSize;
          bestLayout = {
            layoutType: totalTiles === count ? 'dynamic' : 'grid',
            columns: cols,
            rows: rows,
            tileWidth,
            tileHeight,
          };
        }
      }
    }
  }

  // If no layout meets minimums, use grid with best fit
  if (!bestLayout) {
    // Calculate best grid that fits
    const cols = Math.min(4, Math.floor((availableWidth + gap) / (MIN_TILE_WIDTH + gap)));
    const rows = Math.ceil(count / cols);
    const totalGapWidth = (cols - 1) * gap;
    const totalGapHeight = (rows - 1) * gap;
    const tileWidth = Math.max(MIN_TILE_WIDTH, (availableWidth - totalGapWidth) / cols);
    const tileHeight = Math.max(MIN_TILE_HEIGHT, (availableHeight - totalGapHeight) / rows);

    bestLayout = {
      layoutType: 'grid',
      columns: cols,
      rows: rows,
      tileWidth,
      tileHeight,
    };
  }

  return bestLayout;
}

export function getNonSplitLayoutConfig(count: number): NonSplitLayoutConfig {
  if (count <= 0) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 content-center justify-items-center',
      autoRowsClass: '',
      tileBaseClass: '',
    };
  }

  // 1 participant: Full screen
  if (count === 1) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1',
      autoRowsClass: 'auto-rows-[minmax(100%,1fr)]',
      tileBaseClass: 'min-h-full h-full max-h-full w-full',
    };
  }

  // 2 participants: 50/50 split (side by side on landscape, stacked on portrait)
  if (count === 2) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 items-stretch',
      autoRowsClass: 'auto-rows-[minmax(50%,1fr)] sm:auto-rows-[minmax(50%,1fr)]',
      tileBaseClass: 'min-h-[240px] min-w-[320px] h-full w-full max-h-full',
    };
  }

  // 3 participants: 2 on top, 1 centered below (same size as top tiles)
  if (count === 3) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 items-stretch',
      autoRowsClass: 'auto-rows-[minmax(240px,1fr)] sm:auto-rows-[minmax(50%,1fr)]',
      tileBaseClass: 'min-h-[240px] min-w-[320px] max-h-full',
      tileClassForIndex: (index: number) =>
        index === 2 ? 'sm:col-start-1 sm:col-span-2 sm:justify-self-center sm:self-start sm:w-[calc(50%-2px)] sm:max-w-[calc(50%-2px)] sm:min-w-0' : '',
    };
  }

  // 4+ participants: Calculate optimal grid
  // For 4: 2x2 grid
  if (count === 4) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 items-stretch',
      autoRowsClass: 'auto-rows-[minmax(240px,1fr)] sm:auto-rows-[minmax(50%,1fr)]',
      tileBaseClass: 'min-h-[240px] min-w-[320px] max-h-full',
    };
  }

  // For 5-6: 3 columns
  if (count <= 6) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch',
      autoRowsClass: 'auto-rows-[minmax(240px,1fr)]',
      tileBaseClass: 'min-h-[240px] min-w-[320px] max-h-full',
    };
  }

  // For 7-9: 3 columns
  if (count <= 9) {
    return {
      gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch',
      autoRowsClass: 'auto-rows-[minmax(240px,1fr)]',
      tileBaseClass: 'min-h-[240px] min-w-[320px] max-h-full',
    };
  }

  // For 10-16: 4 columns
  return {
    gridClasses: 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch',
    autoRowsClass: 'auto-rows-[minmax(240px,1fr)]',
    tileBaseClass: 'min-h-[240px] min-w-[320px] max-h-full',
  };
}

export function getGridTemplateClasses(count: number): string {
  if (count <= 1) {
    return 'grid-cols-1';
  }
  if (count === 2) {
    return 'grid-cols-1 md:grid-cols-2';
  }
  if (count === 3) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
  if (count >= 4 && count <= 6) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
  if (count >= 7 && count <= 9) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  }
  if (count >= 10 && count <= 16) {
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  }
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

