type ReconnectionState = 'connected' | 'disconnecting' | 'reconnecting' | 'failed';

type DisconnectReason = 'network' | 'auth' | 'server' | 'manual' | 'transport' | 'unknown';

interface ReconnectionConfig {
  gracePeriodMs: number; // 30 seconds for temporary disconnect
  permanentDisconnectMs: number; // 60 seconds for permanent
  maxConsecutiveDisconnects: number;
  transportRecoveryTimeout: number;
  reconnectionBackoffMultiplier: number;
}

interface ReconnectionStateData {
  state: ReconnectionState;
  disconnectReason: DisconnectReason | null;
  disconnectTimestamp: number | null;
  consecutiveDisconnects: number;
  gracePeriodEndTime: number | null;
  isPaused: boolean; // Paused due to page visibility or network offline
}

type ReconnectionStateChangeCallback = (state: ReconnectionState, data: ReconnectionStateData) => void;

class ReconnectionManager {
  private stateData: ReconnectionStateData = {
    state: 'connected',
    disconnectReason: null,
    disconnectTimestamp: null,
    consecutiveDisconnects: 0,
    gracePeriodEndTime: null,
    isPaused: false,
  };

  private config: ReconnectionConfig = {
    gracePeriodMs: 30000, // 30 seconds
    permanentDisconnectMs: 60000, // 60 seconds
    maxConsecutiveDisconnects: 3,
    transportRecoveryTimeout: 10000,
    reconnectionBackoffMultiplier: 1.5,
  };

  private gracePeriodTimer: NodeJS.Timeout | null = null;
  private stateChangeCallbacks: Set<ReconnectionStateChangeCallback> = new Set();
  
  // Store bound function references for proper cleanup
  private boundHandleVisibilityChange: (() => void) | null = null;
  private boundHandleOnline: (() => void) | null = null;
  private boundHandleOffline: (() => void) | null = null;

  constructor(config?: Partial<ReconnectionConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Create bound function references once and store them
    if (typeof window !== 'undefined') {
      this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
      this.boundHandleOnline = this.handleOnline.bind(this);
      this.boundHandleOffline = this.handleOffline.bind(this);
      
      // Listen to page visibility changes using stored bound references
      document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);
      window.addEventListener('online', this.boundHandleOnline);
      window.addEventListener('offline', this.boundHandleOffline);
    }
  }

  /**
   * Handle disconnect event
   */
  handleDisconnect(reason: string): void {
    const disconnectReason = this.parseDisconnectReason(reason);
    const now = Date.now();

    // Increment consecutive disconnects if we were already disconnected
    if (this.stateData.state === 'reconnecting' || this.stateData.state === 'disconnecting') {
      this.stateData.consecutiveDisconnects += 1;
    } else {
      this.stateData.consecutiveDisconnects = 1;
    }

    this.stateData.disconnectReason = disconnectReason;
    this.stateData.disconnectTimestamp = now;

    // Calculate grace period with exponential backoff for multiple disconnects
    const backoffMultiplier = Math.min(
      Math.pow(this.config.reconnectionBackoffMultiplier, this.stateData.consecutiveDisconnects - 1),
      3 // Max 3x multiplier
    );
    const gracePeriod = Math.min(
      this.config.gracePeriodMs * backoffMultiplier,
      90000 // Max 90 seconds
    );

    this.stateData.gracePeriodEndTime = now + gracePeriod;

    // Determine if this is likely a permanent disconnect
    const isPermanent = this.isPermanentDisconnect(disconnectReason);

    if (isPermanent) {
      this.stateData.state = 'failed';
      this.emitStateChange();
      return;
    }

    // Start reconnection process
    this.stateData.state = 'reconnecting';
    this.emitStateChange();

    // Start grace period timer
    this.startGracePeriodTimer(gracePeriod);
  }

  /**
   * Handle successful reconnection
   */
  handleReconnect(): void {
    this.clearGracePeriodTimer();

    // Reset state
    this.stateData.state = 'connected';
    this.stateData.disconnectReason = null;
    this.stateData.disconnectTimestamp = null;
    this.stateData.gracePeriodEndTime = null;
    this.stateData.consecutiveDisconnects = 0;
    this.stateData.isPaused = false;

    this.emitStateChange();
  }

  /**
   * Handle permanent reconnection failure
   */
  handleReconnectFailed(): void {
    this.clearGracePeriodTimer();

    this.stateData.state = 'failed';
    this.emitStateChange();
  }

  /**
   * Cancel reconnection (manual cancellation)
   */
  cancelReconnection(): void {
    this.clearGracePeriodTimer();

    this.stateData.state = 'failed';
    this.stateData.disconnectReason = 'manual';
    this.emitStateChange();
  }

  /**
   * Get current reconnection state
   */
  getState(): ReconnectionState {
    return this.stateData.state;
  }

  /**
   * Get full state data
   */
  getStateData(): Readonly<ReconnectionStateData> {
    return { ...this.stateData };
  }

  /**
   * Get remaining grace period time in milliseconds
   */
  getRemainingGracePeriod(): number {
    if (!this.stateData.gracePeriodEndTime) {
      return 0;
    }
    const remaining = this.stateData.gracePeriodEndTime - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Check if currently in reconnection state
   */
  isReconnecting(): boolean {
    return this.stateData.state === 'reconnecting';
  }

  /**
   * Check if reconnection has failed
   */
  isFailed(): boolean {
    return this.stateData.state === 'failed';
  }

  /**
   * Check if reconnection is paused
   */
  isPaused(): boolean {
    return this.stateData.isPaused;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: ReconnectionStateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Parse disconnect reason from socket.io reason string
   */
  private parseDisconnectReason(reason: string): DisconnectReason {
    const lowerReason = reason.toLowerCase();

    if (lowerReason.includes('auth') || lowerReason.includes('unauthorized')) {
      return 'auth';
    }
    if (lowerReason.includes('server') || lowerReason === 'io server disconnect') {
      return 'server';
    }
    if (lowerReason.includes('transport') || lowerReason === 'transport close') {
      return 'transport';
    }
    if (lowerReason === 'io client disconnect' || lowerReason.includes('manual')) {
      return 'manual';
    }
    if (lowerReason.includes('network') || lowerReason.includes('timeout')) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * Determine if disconnect is likely permanent
   */
  private isPermanentDisconnect(reason: DisconnectReason): boolean {
    // Auth failures are usually permanent (unless token can be refreshed)
    if (reason === 'auth') {
      return true;
    }
    // Manual disconnects are permanent
    if (reason === 'manual') {
      return true;
    }
    // Too many consecutive disconnects
    if (this.stateData.consecutiveDisconnects >= this.config.maxConsecutiveDisconnects) {
      return true;
    }
    return false;
  }

  /**
   * Start grace period timer
   */
  private startGracePeriodTimer(gracePeriodMs: number): void {
    this.clearGracePeriodTimer();

    this.gracePeriodTimer = setTimeout(() => {
      // Grace period expired, check if we're still disconnected
      if (this.stateData.state === 'reconnecting') {
        this.handleReconnectFailed();
      }
    }, gracePeriodMs);
  }

  /**
   * Clear grace period timer
   */
  private clearGracePeriodTimer(): void {
    if (this.gracePeriodTimer) {
      clearTimeout(this.gracePeriodTimer);
      this.gracePeriodTimer = null;
    }
  }

  /**
   * Emit state change to all callbacks
   */
  private emitStateChange(): void {
    const stateData = { ...this.stateData };
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(stateData.state, stateData);
      } catch (error) {
        console.error('Error in reconnection state change callback:', error);
      }
    });
  }

  /**
   * Handle page visibility change
   */
  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    if (document.hidden) {
      // Page hidden - pause reconnection attempts
      if (this.stateData.state === 'reconnecting') {
        this.stateData.isPaused = true;
        this.emitStateChange();
      }
    } else {
      // Page visible - resume reconnection attempts
      if (this.stateData.isPaused && this.stateData.state === 'reconnecting') {
        this.stateData.isPaused = false;
        this.emitStateChange();
      }
    }
  }

  /**
   * Handle network online event
   */
  private handleOnline(): void {
    if (this.stateData.isPaused && this.stateData.state === 'reconnecting') {
      this.stateData.isPaused = false;
      this.emitStateChange();
    }
  }

  /**
   * Handle network offline event
   */
  private handleOffline(): void {
    if (this.stateData.state === 'reconnecting') {
      this.stateData.isPaused = true;
      this.emitStateChange();
    }
  }

  /**
   * Cleanup - remove event listeners
   */
  destroy(): void {
    this.clearGracePeriodTimer();
    this.stateChangeCallbacks.clear();

    if (typeof window !== 'undefined') {
      // Use stored bound function references to properly remove listeners
      if (this.boundHandleVisibilityChange) {
        document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);
        this.boundHandleVisibilityChange = null;
      }
      if (this.boundHandleOnline) {
        window.removeEventListener('online', this.boundHandleOnline);
        this.boundHandleOnline = null;
      }
      if (this.boundHandleOffline) {
        window.removeEventListener('offline', this.boundHandleOffline);
        this.boundHandleOffline = null;
      }
    }
  }
}

export const reconnectionManager = new ReconnectionManager();

export type { ReconnectionState, DisconnectReason, ReconnectionStateData, ReconnectionConfig };

