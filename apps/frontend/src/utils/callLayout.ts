export interface NonSplitLayoutConfig {
  gridClasses: string;
  autoRowsClass: string;
  tileBaseClass: string;
  tileClassForIndex?: (index: number) => string;
}

export function getNonSplitLayoutConfig(count: number): NonSplitLayoutConfig {
  const baseGrid = 'grid h-full w-full gap-4 grid-cols-1 sm:grid-cols-2';

  if (count <= 0) {
    return {
      gridClasses: `${baseGrid} content-center justify-items-center`,
      autoRowsClass: '',
      tileBaseClass: '',
    };
  }

  if (count === 1) {
    return {
      gridClasses: 'grid h-full w-full gap-4 grid-cols-1',
      autoRowsClass: 'auto-rows-[minmax(100%,1fr)]',
      tileBaseClass: 'min-h-full h-full max-h-full',
    };
  }

  if (count === 2) {
    return {
      gridClasses: `${baseGrid} items-stretch`,
      autoRowsClass: 'auto-rows-[minmax(260px,1fr)] sm:auto-rows-[minmax(340px,1fr)]',
      tileBaseClass: 'min-h-[260px] sm:min-h-[340px] max-h-full sm:max-h-[560px]',
    };
  }

  if (count === 3) {
    return {
      gridClasses: `${baseGrid} items-stretch`,
      autoRowsClass: 'auto-rows-[minmax(260px,1fr)] sm:auto-rows-[minmax(320px,1fr)]',
      tileBaseClass: 'min-h-[260px] sm:min-h-[320px] max-h-full sm:max-h-[520px]',
      tileClassForIndex: (index: number) =>
        index === 2 ? 'sm:col-span-2 sm:justify-self-center sm:w-full sm:max-w-[600px]' : '',
    };
  }

  return {
    gridClasses: `${baseGrid} items-stretch`,
    autoRowsClass: 'auto-rows-[minmax(220px,1fr)] sm:auto-rows-[minmax(280px,1fr)]',
    tileBaseClass: 'min-h-[220px] sm:min-h-[280px] max-h-full sm:max-h-[480px]',
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
  return 'grid-cols-1 sm:grid-cols-2';
}

