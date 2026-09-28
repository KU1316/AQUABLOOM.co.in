/**
 * AquaBloom Identifier Generator
 * 
 * Generates:
 * 1. Internal stable UUID-based keys for internal storage (`usr_...`, `ses_...`, `evt_...`)
 * 2. High-entropy, non-sequential business identifiers for public entities (`AB-CMP-...`, `AB-PRP-...`, etc.)
 */

import { BusinessEntityPrefix } from '../types.js';

/**
 * Generates a stable internal random identifier (e.g. usr_1a2b3c4d5e6f)
 */
export function generateInternalId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 16; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${random}`;
}

/**
 * Generates an unguessable, non-sequential public business identifier.
 * Format: AB-[PREFIX]-[RANDOM_ALPHANUMERIC]-[YEAR]
 * Example: AB-CMP-8F2K9M-2026
 */
export function generateBusinessId(prefix: BusinessEntityPrefix): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude visually ambiguous characters (0, 1, I, O)
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const year = new Date().getFullYear();
  return `${prefix}-${random}-${year}`;
}
