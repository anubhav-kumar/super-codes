export const ERROR_HTTP_STATUS = Object.freeze({
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  WINDOW_EXPIRED: 409,
  INTERNAL: 500,
});

export const ERROR_CODES = Object.freeze(
  Object.fromEntries(Object.keys(ERROR_HTTP_STATUS).map((code) => [code, code])),
);

export class AppError extends Error {
  constructor(code, message, details) {
    super(message ?? code);
    if (!(code in ERROR_HTTP_STATUS)) {
      throw new Error(`Unknown error code: ${code}`);
    }
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = details;
  }

  // Shape of every API error response body.
  toBody() {
    const error = { code: this.code, message: this.message };
    if (this.details) error.details = this.details;
    return { error };
  }
}
