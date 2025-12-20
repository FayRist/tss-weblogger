import { ActivatedRoute } from '@angular/router';
import { FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { map, distinctUntilChanged, startWith, take } from 'rxjs/operators';

/**
 * Gets a query parameter as a number from ActivatedRoute
 * @param route - The ActivatedRoute instance
 * @param paramName - The query parameter name
 * @param defaultValue - Default value if parameter is missing
 * @returns Observable of the parameter value as number
 */
export function getQueryParamAsNumber(
  route: ActivatedRoute,
  paramName: string,
  defaultValue: number = 0
): Observable<number> {
  return route.queryParamMap.pipe(
    map((params) => Number(params.get(paramName) ?? defaultValue)),
    distinctUntilChanged()
  );
}

/**
 * Gets a query parameter as a string from ActivatedRoute
 * @param route - The ActivatedRoute instance
 * @param paramName - The query parameter name
 * @param defaultValue - Default value if parameter is missing
 * @returns Observable of the parameter value as string
 */
export function getQueryParamAsString(
  route: ActivatedRoute,
  paramName: string,
  defaultValue: string = ''
): Observable<string> {
  return route.queryParamMap.pipe(
    map((params) => params.get(paramName) ?? defaultValue),
    distinctUntilChanged()
  );
}

/**
 * Gets query parameter once (non-reactive)
 * @param route - The ActivatedRoute instance
 * @returns Observable that emits once with query params
 */
export function getQueryParamsOnce(route: ActivatedRoute): Observable<any> {
  return route.queryParamMap.pipe(take(1));
}

/**
 * Creates an observable from a FormControl that includes the current value
 * @param control - The FormControl instance
 * @returns Observable that emits current value immediately, then on changes
 */
export function formControlWithInitial<T>(control: FormControl<T>): Observable<T | null> {
  return control.valueChanges.pipe(startWith(control.value));
}

