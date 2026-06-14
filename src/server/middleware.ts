// ─── Edge MedTech Copilot - Express Middleware ───

import type { Request, Response, NextFunction } from 'express';

/**
 * Simple request logger middleware.
 * Logs method, URL, status, and response time.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;

    // Color-code status
    const statusColor =
      status >= 500 ? '\x1b[31m' :    // red
      status >= 400 ? '\x1b[33m' :    // yellow
      status >= 300 ? '\x1b[36m' :    // cyan
      '\x1b[32m';                      // green

    console.log(
      `  ${method.padEnd(6)} ${url.padEnd(30)} ${statusColor}${status}\x1b[0m  ${duration}ms`
    );
  });

  next();
}

/**
 * Global error handler middleware.
 * Returns structured JSON errors.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ Unhandled error:', err);

  const status = (err as unknown as { statusCode?: number }).statusCode ?? 500;

  res.status(status).json({
    error: {
      message: err.message || 'Internal server error',
      status,
      timestamp: new Date().toISOString(),
    },
  });
}
