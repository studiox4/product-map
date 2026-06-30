export interface JobHandler<T = unknown> {
  (payload: T): Promise<void>;
}

export interface JobQueue {
  registerWorker<T>(name: string, handler: JobHandler<T>): void;
  enqueue<T>(name: string, payload: T): Promise<void>;
  schedule<T>(name: string, payload: T, delayMs: number): Promise<void>;
}
