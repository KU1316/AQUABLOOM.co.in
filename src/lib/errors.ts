/**
 * AquaBloom Application Error Architecture
 * 
 * Standardized typed errors mapped to HTTP status codes and user-safe messages.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Array<{ field?: string; message: string }>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: Array<{ field?: string; message: string }>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied for this resource') {
    super(message, 403, 'AUTHORIZATION_DENIED');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'A conflict occurred with an existing resource') {
    super(message, 409, 'RESOURCE_CONFLICT');
  }
}

export class AgreementLockedError extends AppError {
  constructor(message: string = 'Campaign Agreement is locked. Normal commercial amendments and mutations are strictly forbidden.') {
    super(message, 409, 'AGREEMENT_LOCKED');
  }
}

export class LogisticsAssignmentNotReadyError extends AppError {
  constructor(message: string = 'Logistics assignment prerequisites are not satisfied.', details?: Array<{ field?: string; message: string }>) {
    super(message, 400, 'LOGISTICS_ASSIGNMENT_NOT_READY', details);
  }
}

export class ServerError extends AppError {
  constructor(message: string = 'An unexpected server error occurred') {
    super(message, 500, 'SERVER_ERROR');
  }
}

/**
 * Sanitizes any error to a client-safe format, strictly stripping sensitive internals,
 * stack traces, database keys, or low-level runtime errors.
 */
export function formatErrorForClient(err: unknown): {
  code: string;
  message: string;
  details?: Array<{ field?: string; message: string }>;
} {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  // Handle standard Error instances with status/code or validation messages
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    if (typeof anyErr.statusCode === 'number' && anyErr.statusCode >= 400 && anyErr.statusCode < 500) {
      return {
        code: anyErr.code || (anyErr.statusCode === 400 ? 'VALIDATION_FAILED' : anyErr.statusCode === 403 ? 'FORBIDDEN' : anyErr.statusCode === 404 ? 'NOT_FOUND' : anyErr.statusCode === 409 ? 'CONFLICT' : 'CLIENT_ERROR'),
        message: anyErr.message || 'Request failed.',
        details: anyErr.details,
      };
    }

    if (err instanceof Error) {
      const msg = err.message || '';
      if (
        msg.includes('required') ||
        msg.includes('Validation') ||
        msg.includes('validation') ||
        msg.includes('must be') ||
        msg.includes('Invalid') ||
        msg.includes('invalid')
      ) {
        return {
          code: anyErr.code || 'VALIDATION_FAILED',
          message: msg,
          details: anyErr.details,
        };
      }
    }
  }

  // Fallback for non-AppErrors (protect against leaking stack traces or internal logs)
  console.error('[Internal Unhandled Error]', err);
  return {
    code: 'SERVER_ERROR',
    message: 'An unexpected system error occurred. Please try again or contact enterprise support.',
  };
}
