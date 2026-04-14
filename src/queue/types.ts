export interface CommandQueue {
  enqueue(commandId: string): void;
  start(): void;
  stop(): void;
}
