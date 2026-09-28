/**
 * AquaBloom Application Event Architecture
 * 
 * Supports three core event streams:
 * 1. BUSINESS TIMELINE (e.g. state transitions, milestones)
 * 2. AUDIT EVENTS (security, auth, permission events, configuration changes)
 * 3. ANALYTICS EVENTS (activity, interactions, aggregated counts)
 */

import { AppEvent, EventCategory, UserRole, VisibilityScope } from '../types.js';
import { generateInternalId } from './idGenerator.js';

export type EventHandler = (event: AppEvent) => Promise<void> | void;

export class EventDispatcher {
  private static instance: EventDispatcher;
  private handlers: Map<EventCategory, Set<EventHandler>> = new Map();
  private inMemoryEventLog: AppEvent[] = [];
  private readonly maxInMemoryEvents = 200;

  private constructor() {
    this.handlers.set('BUSINESS_TIMELINE', new Set());
    this.handlers.set('AUDIT_EVENTS', new Set());
    this.handlers.set('ANALYTICS_EVENTS', new Set());
  }

  public static getInstance(): EventDispatcher {
    if (!EventDispatcher.instance) {
      EventDispatcher.instance = new EventDispatcher();
    }
    return EventDispatcher.instance;
  }

  /**
   * Subscribe an event handler to a category
   */
  public subscribe(category: EventCategory, handler: EventHandler): () => void {
    const set = this.handlers.get(category);
    if (set) {
      set.add(handler);
    }
    return () => {
      set?.delete(handler);
    };
  }

  /**
   * Dispatches an event across subscribers and records to audit log
   */
  public async dispatch(eventData: {
    category: EventCategory;
    eventType: string;
    userId?: string;
    role?: UserRole;
    scope?: VisibilityScope;
    payload?: Record<string, unknown>;
  }): Promise<AppEvent> {
    const event: AppEvent = {
      id: generateInternalId('evt'),
      category: eventData.category,
      eventType: eventData.eventType,
      userId: eventData.userId,
      role: eventData.role,
      scope: eventData.scope || 'INTERNAL_ADMIN',
      payload: eventData.payload || {},
      timestamp: new Date().toISOString(),
    };

    // Store in-memory
    this.inMemoryEventLog.unshift(event);
    if (this.inMemoryEventLog.length > this.maxInMemoryEvents) {
      this.inMemoryEventLog.pop();
    }

    // Trigger subscribers safely
    const categoryHandlers = this.handlers.get(event.category);
    if (categoryHandlers) {
      for (const handler of categoryHandlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(`[EventDispatcher Error for ${event.eventType}]`, err);
        }
      }
    }

    return event;
  }

  /**
   * Retrieves recent events filtered by category or user (internal view)
   */
  public getRecentEvents(category?: EventCategory, limit: number = 20): AppEvent[] {
    let filtered = this.inMemoryEventLog;
    if (category) {
      filtered = filtered.filter((e) => e.category === category);
    }
    return filtered.slice(0, limit);
  }
}

export const eventDispatcher = EventDispatcher.getInstance();
