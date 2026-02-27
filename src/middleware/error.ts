import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  // Log error
  console.error('Error:', err);
  
  // Default error response
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;

  // Handle specific error types
  if (err instanceof HTTPException) {
    statusCode = err.status;
    message = err.message;
    details = err.cause;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = err.message;
  } else if (err.name === 'PostgresError') {
    statusCode = 500;
    message = 'Database Error';
    details = process.env.NODE_ENV === 'development' ? err.message : undefined;
  }

  // Return error response
  return c.json({
    error: {
      message,
      status: statusCode,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  }, statusCode);
};
