import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly counters = {
    requestsTotal: 0,
    errorsTotal: 0,
    authLoginFailed: 0,
    alertsSent: 0,
    alertsFailed: 0,
  };

  inc<K extends keyof typeof this.counters>(key: K, by = 1) {
    this.counters[key] += by;
  }

  snapshot() {
    return {
      ...this.counters,
      at: new Date().toISOString(),
    };
  }
}
