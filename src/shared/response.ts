import type { ErrorCode } from './errors/catalogue.js';

export type ResponseStatus = 'success' | 'error' | 'confirmation_required';

export interface ResponseMetadata {
  request_id?: string;
  server_time: string;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  status: 'success';
  code: string;
  data: T;
  warnings: string[];
  requires_confirmation: false;
  confirmation: null;
  metadata: ResponseMetadata;
}

export interface ErrorResponse {
  ok: false;
  status: 'error';
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggested_actions: string[];
  metadata: ResponseMetadata;
}

export interface ConfirmationResponse<T = unknown> {
  ok: true;
  status: 'confirmation_required';
  code: string;
  data: T;
  warnings: string[];
  requires_confirmation: true;
  confirmation: {
    confirmation_token: string;
    expires_at: string;
    summary: Record<string, unknown>;
  };
  metadata: ResponseMetadata;
}

export type KitchenResponse<T = unknown> =
  | SuccessResponse<T>
  | ErrorResponse
  | ConfirmationResponse<T>;

function serverTime(): string {
  return new Date().toISOString();
}

export function success<T>(
  code: string,
  data: T,
  options?: {
    warnings?: string[];
    request_id?: string;
  },
): SuccessResponse<T> {
  return {
    ok: true,
    status: 'success',
    code,
    data,
    warnings: options?.warnings ?? [],
    requires_confirmation: false,
    confirmation: null,
    metadata: {
      request_id: options?.request_id,
      server_time: serverTime(),
    },
  };
}

export function error(
  code: ErrorCode,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    recoverable?: boolean;
    suggested_actions?: string[];
    request_id?: string;
  },
): ErrorResponse {
  return {
    ok: false,
    status: 'error',
    code,
    message,
    details: options?.details,
    recoverable: options?.recoverable ?? false,
    suggested_actions: options?.suggested_actions ?? [],
    metadata: {
      request_id: options?.request_id,
      server_time: serverTime(),
    },
  };
}

export function confirmation<T>(
  code: string,
  data: T,
  confirmationToken: string,
  expiresAt: string,
  summary: Record<string, unknown>,
  options?: {
    warnings?: string[];
    request_id?: string;
  },
): ConfirmationResponse<T> {
  return {
    ok: true,
    status: 'confirmation_required',
    code,
    data,
    warnings: options?.warnings ?? [],
    requires_confirmation: true,
    confirmation: {
      confirmation_token: confirmationToken,
      expires_at: expiresAt,
      summary,
    },
    metadata: {
      request_id: options?.request_id,
      server_time: serverTime(),
    },
  };
}
