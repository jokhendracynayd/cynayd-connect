import { useMemo, useEffect } from 'react';
import { getNonSplitLayoutConfig, getGridTemplateClasses } from '../../utils/callLayout';

interface UseCallLayoutProps {
  windowSize: { width: number; height: number };
  isScreenSharing: boolean;
  showSplitLayout: boolean;
  isSidebarCollapsed: boolean;
  participantTilesForDisplay: any[];
  allParticipantTiles: any[];
  activeSpeakerId: string | null;
  pinnedScreenShareUserId: string | null;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
}

export function useCallLayout({
  windowSize,
  isScreenSharing,
  showSplitLayout,
  isSidebarCollapsed,
  participantTilesForDisplay,
  allParticipantTiles,
  activeSpeakerId,
  pinnedScreenShareUserId,
  setIsSidebarCollapsed,
}: UseCallLayoutProps) {
  // Calculate maximum tiles based on minimum tile dimensions (320x240) and available space
  const maxVisibleTiles = useMemo(() => {
    // Minimum tile dimensions for proper video visibility
    const MIN_TILE_WIDTH = 320;
    const MIN_TILE_HEIGHT = 240;
    const GAP = 4; // gap-1 = 4px

    // Estimate available space (accounting for controls, padding, and safe margins)
    const availableHeight = windowSize.height - 80 - (isScreenSharing ? 50 : 0) - 20; // minus controls, banner, and safety margin
    const availableWidth = windowSize.width - 40; // minus safety margins

    // Calculate max columns and rows that fit with minimum dimensions
    const maxCols = Math.floor((availableWidth + GAP) / (MIN_TILE_WIDTH + GAP));
    const maxRows = Math.floor((availableHeight + GAP) / (MIN_TILE_HEIGHT + GAP));

    // Cap at 4 columns max (for 4x4 grid)
    const cols = Math.min(4, Math.max(1, maxCols));
    const rows = Math.max(1, maxRows);

    // Return the maximum tiles that fit, ensuring we don't exceed what can actually fit
    const calculatedMax = cols * rows;

    // For your 1521x842 screen: 
    // Width: (1521-40+4)/(320+4) = 1485/324 = 4.58 -> 4 cols
    // Height: (842-80-20+4)/(240+4) = 746/244 = 3.05 -> 3 rows
    // Max = 4 * 3 = 12 tiles

    return Math.min(16, calculatedMax);
  }, [windowSize, isScreenSharing]);

  const isSoloLayout = !showSplitLayout && participantTilesForDisplay.length === 1;
  
  const nonSplitLayoutConfig = useMemo(() => {
    if (showSplitLayout) {
      return null;
    }
    return getNonSplitLayoutConfig(participantTilesForDisplay.length);
  }, [showSplitLayout, participantTilesForDisplay.length]);

  const splitGridClasses = showSplitLayout ? getGridTemplateClasses(participantTilesForDisplay.length) : '';
  
  const splitGridAutoRowsClass =
    showSplitLayout && participantTilesForDisplay.length >= 10
      ? 'auto-rows-[minmax(240px,1fr)]'
      : showSplitLayout && participantTilesForDisplay.length >= 7
        ? 'auto-rows-[minmax(240px,1fr)]'
        : showSplitLayout
          ? 'auto-rows-[minmax(240px,1fr)]'
          : '';

  const bottomControlsOffset = 80; // Height of bottom controls bar (48px button + 12px top padding + 12px bottom padding + 8px buffer)
  const screenShareBannerHeight = 50; // Height of screen share banner (py-3 = 12px top + 12px bottom + ~20px content + 1px border + buffer)
  const topOffset = isScreenSharing ? screenShareBannerHeight : 0;
  
  const splitLayoutContainerStyle = useMemo(() => {
    if (!showSplitLayout) {
      return undefined;
    }
    return {
      maxHeight: `calc(100vh - ${topOffset}px - ${bottomControlsOffset}px - env(safe-area-inset-bottom))`,
      paddingBottom: 0,
      marginBottom: 0,
    };
  }, [showSplitLayout, bottomControlsOffset, topOffset]);

  const sharePaneBaseClasses =
    'flex-1 min-h-0 min-w-0 overflow-hidden rounded-[32px] border border-gray-700/50 bg-gray-900/40 shadow-[0_30px_60px_-35px_rgba(0,0,0,0.5)] backdrop-blur';
  
  const sharePaneClassName = showSplitLayout
    ? `${sharePaneBaseClasses} ${isSidebarCollapsed ? 'lg:basis-full xl:basis-full' : 'lg:basis-[78%] xl:basis-[82%]'}`
    : sharePaneBaseClasses;

  const activeSpeakerTile = showSplitLayout
    ? allParticipantTiles.find(tile => tile.userId === activeSpeakerId)
    : undefined;

  const activeSpeakerStream = activeSpeakerTile?.stream ?? null;
  const activeSpeakerFirstVideoTrack = activeSpeakerStream?.getVideoTracks?.()[0];
  const activeSpeakerTileFacingMode = activeSpeakerFirstVideoTrack?.getSettings?.().facingMode;
  const activeSpeakerTrackLabel = activeSpeakerFirstVideoTrack?.label?.toLowerCase() ?? '';
  
  const activeSpeakerIsProbableScreenShare =
    activeSpeakerTrackLabel.includes('screen') ||
    activeSpeakerTrackLabel.includes('display') ||
    activeSpeakerTrackLabel.includes('window');

  const activeSpeakerHasLiveVideo = Boolean(
    activeSpeakerStream &&
    activeSpeakerStream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled) &&
    !activeSpeakerTile?.isVideoMuted
  );

  const shouldShowActiveSpeakerOverlay = Boolean(
    showSplitLayout && activeSpeakerTile && activeSpeakerTile.userId !== pinnedScreenShareUserId
  );

  const mainLayoutSpacingClass = isSidebarCollapsed ? 'gap-2 pt-0 pb-0 m-0' : 'gap-4 pt-0 pb-0 m-0';

  // Auto-collapse sidebar when split layout is disabled
  useEffect(() => {
    if (!showSplitLayout && isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
  }, [showSplitLayout, isSidebarCollapsed, setIsSidebarCollapsed]);

  return {
    maxVisibleTiles,
    isSoloLayout,
    nonSplitLayoutConfig,
    splitGridClasses,
    splitGridAutoRowsClass,
    bottomControlsOffset,
    screenShareBannerHeight,
    topOffset,
    splitLayoutContainerStyle,
    sharePaneBaseClasses,
    sharePaneClassName,
    activeSpeakerTile,
    activeSpeakerStream,
    activeSpeakerTileFacingMode,
    activeSpeakerIsProbableScreenShare,
    activeSpeakerHasLiveVideo,
    shouldShowActiveSpeakerOverlay,
    mainLayoutSpacingClass,
  };
}

