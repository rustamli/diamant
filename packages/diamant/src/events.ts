import type { DiamantEvent, DiamantEventType } from './types.js';

type EventListener = (event: DiamantEvent) => void;

export class EventEmitter {
  private listeners = new Map<DiamantEventType, Set<EventListener>>();

  on(type: DiamantEventType, listener: EventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  off(type: DiamantEventType, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: DiamantEventType, event: Omit<DiamantEvent, 'type' | 'timestamp'>): void {
    const fullEvent: DiamantEvent = {
      ...event,
      type,
      timestamp: new Date().toISOString(),
    };
    this.listeners.get(type)?.forEach((listener) => {
      try {
        listener(fullEvent);
      } catch {
        // Swallow listener errors to avoid breaking the caller
      }
    });
  }
}
