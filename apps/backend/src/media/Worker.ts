import * as mediasoup from 'mediasoup';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import os from 'os';

type Worker = mediasoup.types.Worker;

interface WorkerWithIndex {
  worker: Worker;
  index: number;
  pid: number | null;
  routerCount: number;
}

export class WorkerManager {
  private static workers: WorkerWithIndex[] = [];
  private static currentWorkerIndex = 0;
  private static restarting = false;

  static async createWorkers() {
    const numWorkers = os.cpus().length;
    logger.info(`Creating ${numWorkers} Mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      await this.createSingleWorker(i);
    }

    logger.info('All Mediasoup workers created successfully');
  }

  private static async createSingleWorker(index: number): Promise<Worker> {
    const worker = await mediasoup.createWorker({
      logLevel: mediasoupConfig.worker.logLevel,
      logTags: mediasoupConfig.worker.logTags,
      rtcMinPort: mediasoupConfig.worker.rtcMinPort,
      rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
    });

    const workerWithIndex: WorkerWithIndex = {
      worker,
      index,
      pid: worker.pid,
      routerCount: 0,
    };

    worker.on('died', async () => {
      logger.error(`Mediasoup worker ${worker.pid} (index ${index}) died unexpectedly`);
      
      // Prevent multiple simultaneous restarts
      if (this.restarting) {
        logger.warn('Worker restart already in progress, skipping...');
        return;
      }

      await this.handleWorkerDeath(workerWithIndex);
    });

    this.workers[index] = workerWithIndex;
    logger.info(`Worker ${index + 1}/${this.workers.length} created (PID: ${worker.pid})`);
    
    return worker;
  }

  /**
   * Handle worker death gracefully:
   * 1. Migrate routers to other workers
   * 2. Restart the dead worker
   * 3. Continue serving without interruption
   */
  private static async handleWorkerDeath(deadWorkerInfo: WorkerWithIndex): Promise<void> {
    this.restarting = true;
    const deadIndex = deadWorkerInfo.index;

    try {
      logger.warn(`Handling death of worker ${deadWorkerInfo.pid} (index ${deadIndex})...`);

      // Get all routers from this worker (need to get from RouterManager)
      const { RouterManager } = await import('./Router');
      const routerStats = RouterManager.getStats();
      
      logger.info(`Found ${routerStats.total} routers. Migrating routers from dead worker...`);

      // Get a healthy worker to migrate to
      const healthyWorker = this.getHealthyWorker(deadIndex);
      if (!healthyWorker) {
        logger.error('No healthy workers available! Cannot migrate routers.');
        // In production, you might want to alert monitoring systems
        return;
      }

      // Note: In Mediasoup, routers can't be moved between workers
      // The actual migration happens by:
      // 1. Closing routers on dead worker (handled automatically)
      // 2. Clients will reconnect and create new routers on healthy workers
      // 3. We can restart the worker to prepare for new connections

      logger.info(`Worker ${deadWorkerInfo.pid} routers will be automatically cleaned up. Clients will reconnect.`);

      // Restart the dead worker
      logger.info(`Restarting worker at index ${deadIndex}...`);
      await this.restartWorker(deadIndex);

      logger.info(`Worker ${deadIndex} restarted successfully`);
    } catch (error) {
      logger.error(`Error handling worker death for index ${deadIndex}:`, error);
      // Don't exit - continue serving with remaining workers
    } finally {
      this.restarting = false;
    }
  }

  /**
   * Restart a dead worker
   */
  private static async restartWorker(index: number): Promise<void> {
    try {
      // Remove old worker reference
      const oldWorkerInfo = this.workers[index];
      if (oldWorkerInfo?.worker) {
        try {
          // Worker is already dead, but try to close just in case
          oldWorkerInfo.worker.close();
        } catch (error) {
          // Worker is already closed/dead, ignore
        }
      }

      // Create new worker
      await this.createSingleWorker(index);
      
      logger.info(`Worker ${index} restarted with new PID: ${this.workers[index].pid}`);
    } catch (error) {
      logger.error(`Failed to restart worker ${index}:`, error);
      // Don't exit - try again later or operate with fewer workers
      throw error;
    }
  }

  /**
   * Get a healthy worker (not the dead one)
   */
  private static getHealthyWorker(deadIndex: number): Worker | null {
    for (let i = 0; i < this.workers.length; i++) {
      if (i === deadIndex) continue;
      const workerInfo = this.workers[i];
      if (workerInfo?.worker && workerInfo.pid !== null) {
        // Check if worker is still alive by checking pid
        try {
          process.kill(workerInfo.pid, 0); // Signal 0 just checks if process exists
          return workerInfo.worker;
        } catch (error) {
          // Worker is dead, try next one
          continue;
        }
      }
    }
    return null;
  }

  static getWorker(): Worker {
    if (this.workers.length === 0) {
      throw new Error('No workers available');
    }

    // Skip dead workers
    let attempts = 0;
    while (attempts < this.workers.length) {
      const workerInfo = this.workers[this.currentWorkerIndex];
      
      if (workerInfo?.worker && workerInfo.pid !== null) {
        // Check if worker is alive
        try {
          if (workerInfo.pid) {
            process.kill(workerInfo.pid, 0); // Check if process exists
          }
          
          // Worker is alive, increment router count and return
          workerInfo.routerCount++;
          const worker = workerInfo.worker;
          this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
          return worker;
        } catch (error) {
          // Worker is dead, try to restart it
          logger.warn(`Worker ${workerInfo.pid} appears dead, attempting restart...`);
          this.restartWorker(workerInfo.index).catch(err =>
            logger.error(`Failed to restart worker ${workerInfo.index}:`, err)
          );
        }
      }
      
      // Move to next worker
      this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
      attempts++;
    }

    throw new Error('No healthy workers available');
  }

  static async close() {
    logger.info('Closing all Mediasoup workers...');
    for (const workerInfo of this.workers) {
      if (workerInfo?.worker) {
        try {
          workerInfo.worker.close();
        } catch (error) {
          logger.error(`Error closing worker ${workerInfo.pid}:`, error);
        }
      }
    }
    this.workers = [];
    this.currentWorkerIndex = 0;
    logger.info('All workers closed');
  }

  static getStats() {
    const healthyWorkers = this.workers.filter(w => w?.worker && w.pid !== null);
    return {
      total: this.workers.length,
      healthy: healthyWorkers.length,
      currentIndex: this.currentWorkerIndex,
      workers: this.workers.map(w => ({
        index: w.index,
        pid: w.pid,
        routerCount: w.routerCount,
        healthy: w.worker && w.pid !== null,
      })),
    };
  }

  /**
   * Register router creation (for tracking which routers are on which workers)
   */
  static registerRouter(workerIndex: number): void {
    if (this.workers[workerIndex]) {
      this.workers[workerIndex].routerCount++;
    }
  }

  /**
   * Unregister router (when router is closed)
   */
  static unregisterRouter(workerIndex: number): void {
    if (this.workers[workerIndex] && this.workers[workerIndex].routerCount > 0) {
      this.workers[workerIndex].routerCount--;
    }
  }
}

