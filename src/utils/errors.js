export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export function badRequest(message) {
  return new AppError(message, 400);
}

export function serverError(message) {
  return new AppError(message, 500);
}
