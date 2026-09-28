/**
 * AquaBloom Validation Foundation
 * 
 * Reusable validation functions for inputs, forms, and API payloads.
 */

import { PUBLIC_ROLES, UserRole, RegisterInput, LoginInput } from '../types.js';
import { ValidationError } from './errors.js';

export interface FieldError {
  field: string;
  message: string;
}

export function validateEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return 'Email address is required.';
  }
  const cleanEmail = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return 'Please enter a valid business email address.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters in length.';
  }
  return null;
}

export function validatePublicRole(role: string): string | null {
  if (!role) {
    return 'Role selection is required.';
  }
  // ADMIN is strictly rejected from public role selection
  if (role === 'ADMIN') {
    return 'Administrative accounts cannot be registered publicly.';
  }
  if (!PUBLIC_ROLES.includes(role as UserRole)) {
    return `Invalid role specified. Must be one of: ${PUBLIC_ROLES.join(', ')}.`;
  }
  return null;
}

export function validateRequiredString(val: unknown, fieldName: string, minLength: number = 2): string | null {
  if (typeof val !== 'string' || val.trim().length < minLength) {
    return `${fieldName} must be at least ${minLength} characters.`;
  }
  return null;
}

export function validateRegistrationInput(input: Partial<RegisterInput>): {
  isValid: boolean;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];

  const emailErr = validateEmail(input.email || '');
  if (emailErr) errors.push({ field: 'email', message: emailErr });

  const passErr = validatePassword(input.password || '');
  if (passErr) errors.push({ field: 'password', message: passErr });

  const roleErr = validatePublicRole(input.role || '');
  if (roleErr) errors.push({ field: 'role', message: roleErr });

  const orgErr = validateRequiredString(input.organizationName, 'Organization name', 2);
  if (orgErr) errors.push({ field: 'organizationName', message: orgErr });

  const contactErr = validateRequiredString(input.contactName, 'Contact name', 2);
  if (contactErr) errors.push({ field: 'contactName', message: contactErr });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function assertValidRegistration(input: Partial<RegisterInput>): void {
  const { isValid, errors } = validateRegistrationInput(input);
  if (!isValid) {
    throw new ValidationError('Registration form validation failed', errors);
  }
}

export function validateLoginInput(input: Partial<LoginInput>): {
  isValid: boolean;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];

  const emailErr = validateEmail(input.email || '');
  if (emailErr) errors.push({ field: 'email', message: emailErr });

  const passErr = validatePassword(input.password || '');
  if (passErr) errors.push({ field: 'password', message: passErr });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
