import * as mediasoup from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import os from 'os';

export class WorkerManager {
  private static workers: Worker[] = [];
  private static currentWorkerIndex = 0;

  static async createWorkers() {
    const numWorkers = os.cpus().length;
    logger.info(`Creating ${numWorkers} Mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: mediasoupConfig.worker.logLevel,
        logTags: mediasoupConfig.worker.logTags,
        rtcMinPort: mediasoupConfig.worker.rtcMinPort,
        rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
      });

      worker.on('died', () => {
        logger.error(`Mediasoup worker ${worker.pid} died, exiting in 2 seconds...`);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
      logger.info(`Worker ${i + 1}/${numWorkers} created (PID: ${worker.pid})`);
    }

    logger.info('All Mediasoup workers created successfully');
  }

  static getWorker(): Worker {
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  static async close() {
    logger.info('Closing all Mediasoup workers...');
    for (const worker of this.workers) {
      worker.close();
    }
    this.workers = [];
    logger.info('All workers closed');
  }

  static getStats() {
    return {
      total: this.workers.length,
      currentIndex: this.currentWorkerIndex,
    };
  }
}

