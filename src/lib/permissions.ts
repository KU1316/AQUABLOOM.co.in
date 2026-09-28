/**
 * AquaBloom Authorization & Permissions Engine
 * 
 * Implements backend-oriented authorization principles:
 * - UI hiding is never security.
 * - Enforces explicit role checks.
 * - Supports visibility scopes: PRIVATE, ROLE_SHARED, TRANSACTION_SHARED, PUBLIC, INTERNAL_ADMIN.
 */

import { UserRole, VisibilityScope, User } from '../types.js';
import { AuthorizationError } from './errors.js';

export interface ResourceDescriptor {
  scope: VisibilityScope;
  ownerId?: string;
  allowedRoles?: UserRole[];
  sharedTransactionParticipantIds?: string[];
}

/**
 * Checks whether an actor (or unauthenticated request) has access to a resource based on its Visibility Scope.
 */
export function canAccessResource(
  actor: User | null,
  resource: ResourceDescriptor
): boolean {
  // Public scope is visible to everyone, including guests
  if (resource.scope === 'PUBLIC') {
    return true;
  }

  // All other scopes require authentication
  if (!actor) {
    return false;
  }

  // Internal Admin has internal oversight across scopes
  if (actor.role === 'ADMIN') {
    return true;
  }

  switch (resource.scope) {
    case 'INTERNAL_ADMIN':
      // Strictly accessible by ADMIN (already returned true above if ADMIN)
      return false;

    case 'PRIVATE':
      // Strictly accessible only by the owner
      return !!resource.ownerId && resource.ownerId === actor.id;

    case 'ROLE_SHARED':
      // Accessible if actor belongs to the specified roles or is owner
      if (resource.ownerId && resource.ownerId === actor.id) {
        return true;
      }
      return !!resource.allowedRoles && resource.allowedRoles.includes(actor.role);

    case 'TRANSACTION_SHARED':
      // Accessible to designated participants of the commercial transaction
      if (resource.ownerId && resource.ownerId === actor.id) {
        return true;
      }
      return (
        !!resource.sharedTransactionParticipantIds &&
        resource.sharedTransactionParticipantIds.includes(actor.id)
      );

    default:
      return false;
  }
}

/**
 * Enforces role authorization; throws AuthorizationError if access is denied.
 */
export function requireRole(actor: User | null, allowedRoles: UserRole[]): void {
  if (!actor) {
    throw new AuthorizationError('Authentication required to access this resource.');
  }

  if (!allowedRoles.includes(actor.role)) {
    throw new AuthorizationError(
      `Role '${actor.role}' is not authorized to perform this action. Required: ${allowedRoles.join(', ')}.`
    );
  }
}

/**
 * Enforces resource access; throws AuthorizationError if denied.
 */
export function assertResourceAccess(actor: User | null, resource: ResourceDescriptor): void {
  if (!canAccessResource(actor, resource)) {
    throw new AuthorizationError('You do not possess the required visibility scope for this resource.');
  }
}
