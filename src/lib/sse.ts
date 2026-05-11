import { EventEmitter } from 'node:events';

export type ScheduleEvent =
  | { type: 'created'; id: number }
  | { type: 'updated'; id: number }
  | { type: 'deleted'; id: number }
  | { type: 'status'; id: number; status: string };

declare global {
  // eslint-disable-next-line no-var
  var __flancarBus: EventEmitter | undefined;
}

function bus(): EventEmitter {
  if (!globalThis.__flancarBus) {
    const e = new EventEmitter();
    e.setMaxListeners(0);
    globalThis.__flancarBus = e;
  }
  return globalThis.__flancarBus;
}

export function emitScheduleEvent(event: ScheduleEvent): void {
  bus().emit('schedule', event);
}

export function subscribeSchedule(listener: (event: ScheduleEvent) => void): () => void {
  bus().on('schedule', listener);
  return () => {
    bus().off('schedule', listener);
  };
}
