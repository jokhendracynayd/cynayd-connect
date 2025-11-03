import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../utils/logger';
import { WorkerManager } from '../../media/Worker';
import { TransportManager } from '../../media/Transport';
import { ProducerManager } from '../../media/Producer';
import { ConsumerManager } from '../../media/Consumer';
import { RouterManager } from '../../media/Router';
import { RoomRoutingService } from '../services/room-routing.service';
import { config } from '../config';

/**
 * Prometheus Metrics Collection
 * Exports metrics for monitoring system health and performance
 */
class PrometheusMetrics {
  private registry: Registry;
  private updateInterval?: NodeJS.Timeout;

  // HTTP metrics
  public readonly httpRequestDuration: Histogram<string>;
  public readonly httpRequestTotal: Counter<string>;
  public readonly httpRequestErrors: Counter<string>;

  // WebSocket/Socket.io metrics
  public readonly socketConnections: Gauge<string>;
  public readonly socketDisconnections: Counter<string>;
  public readonly socketErrors: Counter<string>;

  // Mediasoup metrics
  public readonly mediasoupWorkers: Gauge<string>;
  public readonly mediasoupTransports: Gauge<string>;
  public readonly mediasoupProducers: Gauge<string>;
  public readonly mediasoupConsumers: Gauge<string>;
  public readonly mediasoupRouters: Gauge<string>;

  // Room metrics
  public readonly activeRooms: Gauge<string>;
  public readonly activeParticipants: Gauge<string>;

  // Database metrics
  public readonly databaseQueries: Counter<string>;
  public readonly databaseQueryDuration: Histogram<string>;
  public readonly databaseErrors: Counter<string>;

  // Redis metrics
  public readonly redisOperations: Counter<string>;
  public readonly redisOperationDuration: Histogram<string>;
  public readonly redisErrors: Counter<string>;

  // System metrics
  public readonly serverUptime: Gauge<string>;
  public readonly memoryUsage: Gauge<string>;
  public readonly cpuUsage: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
      registers: [this.registry],
    });

    // WebSocket/Socket.io metrics
    this.socketConnections = new Gauge({
      name: 'socket_connections_active',
      help: 'Number of active Socket.io connections',
      registers: [this.registry],
    });

    this.socketDisconnections = new Counter({
      name: 'socket_disconnections_total',
      help: 'Total number of Socket.io disconnections',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.socketErrors = new Counter({
      name: 'socket_errors_total',
      help: 'Total number of Socket.io errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    // Mediasoup metrics
    this.mediasoupWorkers = new Gauge({
      name: 'mediasoup_workers_total',
      help: 'Number of Mediasoup workers',
      registers: [this.registry],
    });

    this.mediasoupTransports = new Gauge({
      name: 'mediasoup_transports_active',
      help: 'Number of active Mediasoup transports',
      registers: [this.registry],
    });

    this.mediasoupProducers = new Gauge({
      name: 'mediasoup_producers_active',
      help: 'Number of active Mediasoup producers',
      registers: [this.registry],
    });

    this.mediasoupConsumers = new Gauge({
      name: 'mediasoup_consumers_active',
      help: 'Number of active Mediasoup consumers',
      registers: [this.registry],
    });

    this.mediasoupRouters = new Gauge({
      name: 'mediasoup_routers_active',
      help: 'Number of active Mediasoup routers',
      registers: [this.registry],
    });

    // Room metrics
    this.activeRooms = new Gauge({
      name: 'rooms_active',
      help: 'Number of active rooms',
      registers: [this.registry],
    });

    this.activeParticipants = new Gauge({
      name: 'participants_active',
      help: 'Number of active participants across all rooms',
      registers: [this.registry],
    });

    // Database metrics
    this.databaseQueries = new Counter({
      name: 'database_queries_total',
      help: 'Total number of database queries',
      labelNames: ['operation', 'table'],
      registers: [this.registry],
    });

    this.databaseQueryDuration = new Histogram({
      name: 'database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.databaseErrors = new Counter({
      name: 'database_errors_total',
      help: 'Total number of database errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    // Redis metrics
    this.redisOperations = new Counter({
      name: 'redis_operations_total',
      help: 'Total number of Redis operations',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.redisOperationDuration = new Histogram({
      name: 'redis_operation_duration_seconds',
      help: 'Duration of Redis operations in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    this.redisErrors = new Counter({
      name: 'redis_errors_total',
      help: 'Total number of Redis errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    // System metrics
    this.serverUptime = new Gauge({
      name: 'server_uptime_seconds',
      help: 'Server uptime in seconds',
      registers: [this.registry],
    });

    this.memoryUsage = new Gauge({
      name: 'server_memory_bytes',
      help: 'Server memory usage in bytes',
      labelNames: ['type'], // heapUsed, heapTotal, external, rss
      registers: [this.registry],
    });

    this.cpuUsage = new Gauge({
      name: 'server_cpu_usage_seconds',
      help: 'Server CPU usage in seconds',
      labelNames: ['type'], // user, system
      registers: [this.registry],
    });

    // Collect default Node.js metrics (memory, CPU, etc.)
    collectDefaultMetrics({ register: this.registry });
  }

  /**
   * Start metrics collection (periodic updates)
   */
  startCollection(): void {
    if (this.updateInterval) {
      logger.warn('Metrics collection already started');
      return;
    }

    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update every 5 seconds

    logger.info('Prometheus metrics collection started');
  }

  /**
   * Stop metrics collection
   */
  stopCollection(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
      logger.info('Prometheus metrics collection stopped');
    }
  }

  /**
   * Update dynamic metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      // Mediasoup metrics
      const workerStats = WorkerManager.getStats();
      this.mediasoupWorkers.set(workerStats.total);

      const transportStats = TransportManager.getStats();
      this.mediasoupTransports.set(transportStats.total);

      const producerStats = ProducerManager.getStats();
      this.mediasoupProducers.set(producerStats.totalProducers);

      const consumerStats = ConsumerManager.getStats();
      this.mediasoupConsumers.set(consumerStats.totalConsumers);

      const routerStats = RouterManager.getStats();
      this.mediasoupRouters.set(routerStats.total);

      // Room metrics
      try {
        const roomCount = await RoomRoutingService.getServerRoomCount(
          config.server.instanceId
        );
        this.activeRooms.set(roomCount);
      } catch (error) {
        logger.error('Error updating room metrics:', error);
      }

      // System metrics
      this.serverUptime.set(process.uptime());

      const memory = process.memoryUsage();
      this.memoryUsage.set({ type: 'heapUsed' }, memory.heapUsed);
      this.memoryUsage.set({ type: 'heapTotal' }, memory.heapTotal);
      this.memoryUsage.set({ type: 'external' }, memory.external);
      this.memoryUsage.set({ type: 'rss' }, memory.rss);

      const cpu = process.cpuUsage();
      this.cpuUsage.set({ type: 'user' }, cpu.user / 1000000); // Convert to seconds
      this.cpuUsage.set({ type: 'system' }, cpu.system / 1000000);
    } catch (error) {
      logger.error('Error updating metrics:', error);
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics registry
   */
  getRegistry(): Registry {
    return this.registry;
  }
}

// Export singleton instance
export const metrics = new PrometheusMetrics();

