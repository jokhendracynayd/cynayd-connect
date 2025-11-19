interface SpeakingIndicatorProps {
  isSpeaking: boolean;
  level?: 'quiet' | 'normal' | 'loud';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * SpeakingIndicator - Visual component showing animated speaking indicator
 * 
 * Displays animated pulsing rings when speaking with three intensity levels.
 * Uses smooth CSS animations for 60fps performance.
 */
export default function SpeakingIndicator({
  isSpeaking,
  level = 'normal',
  size = 'md',
  className = '',
}: SpeakingIndicatorProps) {
  // Debug: Log when component renders
  console.log('[SpeakingIndicator] Rendering with isSpeaking:', isSpeaking, 'level:', level, 'size:', size);
  
  if (!isSpeaking) {
    console.log('[SpeakingIndicator] Not speaking, returning null');
    return null;
  }

  // Size variants
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  // Level-based opacity and animation intensity
  const levelStyles = {
    quiet: {
      outer: 'opacity-50',
      middle: 'opacity-40',
      inner: 'opacity-30',
      pulseSpeed: 'animate-pulse',
    },
    normal: {
      outer: 'opacity-75',
      middle: 'opacity-65',
      inner: 'opacity-55',
      pulseSpeed: 'animate-pulse',
    },
    loud: {
      outer: 'opacity-100',
      middle: 'opacity-90',
      inner: 'opacity-80',
      pulseSpeed: 'animate-pulse',
    },
  };

  const currentLevel = levelStyles[level];

  return (
    <div
      className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label={isSpeaking ? 'Speaking' : 'Not speaking'}
      style={{ 
        // Ensure visibility - force display
        display: 'flex',
        visibility: 'visible'
      }}
    >
      {/* Three concentric pulsing rings */}
      <div
        className={`absolute inset-0 rounded-full border-2 border-cyan-400 ${currentLevel.outer}`}
        style={{
          animation: 'speaking-pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        className={`absolute inset-2 rounded-full border-2 border-cyan-400 ${currentLevel.middle}`}
        style={{
          animation: 'speaking-pulse 1.2s ease-in-out infinite',
          animationDelay: '0.2s',
        }}
      />
      <div
        className={`absolute inset-4 rounded-full border-2 border-cyan-400 ${currentLevel.inner}`}
        style={{
          animation: 'speaking-pulse 1s ease-in-out infinite',
          animationDelay: '0.4s',
        }}
      />
      
      {/* Center dot */}
      <div
        className={`absolute inset-0 m-auto w-2 h-2 rounded-full bg-cyan-400 ${currentLevel.outer}`}
        style={{
          animation: 'speaking-pulse 0.8s ease-in-out infinite',
        }}
      />
    </div>
  );
}
