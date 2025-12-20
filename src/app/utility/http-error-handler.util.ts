import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

/**
 * Handles HTTP errors consistently across the application
 * @param operation - Description of the operation that failed
 * @param error - The error response from the HTTP call
 * @returns Observable that throws the error
 */
export function handleHttpError(operation: string, error: HttpErrorResponse | Error): Observable<never> {
  const errorMessage = error instanceof HttpErrorResponse
    ? `Error ${operation}: ${error.message || error.statusText || 'Unknown error'}`
    : `Error ${operation}: ${error.message || 'Unknown error'}`;
  
  console.error(errorMessage, error);
  return throwError(() => error);
}

