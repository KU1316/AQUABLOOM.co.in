/**
 * AquaBloom Reliability Architecture Foundation
 * 
 * Provides:
 * 1. Idempotency manager (protects against duplicate requests, payment retries, double submits)
 * 2. Safe state transition engine validator
 * 3. Retry with exponential backoff utility
 * 4. Atomic transaction simulator helper
 */

import { ConflictError } from './errors.js';
import { IdempotencyRecord } from '../types.js';

export class IdempotencyManager {
  private static instance: IdempotencyManager;
  private records: Map<string, IdempotencyRecord> = new Map();

  public static getInstance(): IdempotencyManager {
    if (!IdempotencyManager.instance) {
      IdempotencyManager.instance = new IdempotencyManager();
    }
    return IdempotencyManager.instance;
  }

  /**
   * Check if a request has already been processed with this idempotency key.
   */
  public getRecord(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  /**
   * Stores completed response for an idempotency key.
   */
  public saveRecord(record: IdempotencyRecord): void {
    this.records.set(record.key, record);
  }

  /**
   * Asserts key is not currently in conflict.
   */
  public assertNotDuplicate(key?: string): void {
    if (!key) return;
    const existing = this.records.get(key);
    if (existing) {
      throw new ConflictError(`Duplicate request detected for idempotency key: ${key}`);
    }
  }
}

export const idempotencyManager = IdempotencyManager.getInstance();

/**
 * State Transition Guard
 * Ensures entities only move through validated acyclic status paths without inventing
 * business-specific rules prematurely.
 */
export interface StateTransitionConfig<TState extends string> {
  allowedTransitions: Record<TState, TState[]>;
}

export function validateStateTransition<TState extends string>(
  currentState: TState,
  targetState: TState,
  config: StateTransitionConfig<TState>
): boolean {
  if (currentState === targetState) return true;
  const validNextStates = config.allowedTransitions[currentState] || [];
  return validNextStates.includes(targetState);
}

/**
 * Retry helper with exponential backoff and jitter
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; initialDelayMs?: number; backoffFactor?: number } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 200, backoffFactor = 2 } = options;
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      // Add jitter
      const jitter = Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay *= backoffFactor;
    }
  }

  throw new Error('Retry limit reached');
}

/**
 * Atomic execution wrapper with simulated compensation/rollback hook
 */
export async function executeAtomic<T>(
  action: () => Promise<T>,
  compensation?: (error: unknown) => Promise<void>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (compensation) {
      try {
        await compensation(error);
      } catch (compensationError) {
        console.error('[Atomic Compensation Failure]', compensationError);
      }
    }
    throw error;
  }
}
