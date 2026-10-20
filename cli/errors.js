// CLI error type and exit codes (DESIGN §14.2, §14.3).

export const EXIT = {
  OK: 0,
  USAGE: 1,
  NETWORK: 2,
  VALIDATION: 3,
  NOT_FOUND: 4,
  TIMEOUT: 5,
  CONFLICT: 6,
};

export const HEALTH_HINT = 'run "chat health" to diagnose';

export class CliError extends Error {
  constructor(exitCode, code, message) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.code = code;
  }
}

export function usageError(message, command) {
  const hint = command ? `run "chat ${command} --help"` : 'run "chat --help"';
  return new CliError(EXIT.USAGE, 'usage', `${message} (${hint})`);
}

export function validationError(message) {
  return new CliError(EXIT.VALIDATION, 'validation_failed', message);
}

export function invalidResponse(message, exitCode = EXIT.VALIDATION) {
  return new CliError(exitCode, 'invalid_response', message);
}

export function fileNotFound(path) {
  return new CliError(EXIT.NOT_FOUND, 'file_not_found', `file not found: ${path}`);
}
