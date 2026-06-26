import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavigationContextService } from './navigation-context.service';
import { AuthService } from '../auth/auth.service';

function redirectToFallback(router: Router, auth: AuthService, excludePaths: string[] = []): false {
  const fallbackPath = auth.getFirstAllowedPath(excludePaths);
  if (fallbackPath) {
    router.navigateByUrl(`/${fallbackPath}`, { replaceUrl: true });
    return false;
  }

  auth.logoutDueToMissingPermissions();
  return false;
}

export const requireDashboardContextGuard: CanActivateFn = () => {
  const navContext = inject(NavigationContextService);
  const router = inject(Router);
  const auth = inject(AuthService);
  const ctx = navContext.snapshot;

  if (!auth.isLoggedIn()) {
    router.navigate(['/login'], { replaceUrl: true });
    return false;
  }

  if (!auth.hasPathPermission('pages/dashboard', 'GET')) {
    return redirectToFallback(router, auth, ['pages/dashboard']);
  }

  const hasEventId = Number(ctx.eventId) > 0;
  const hasRaceId = Number(ctx.raceId) > 0;
  const hasSegment = !!(ctx.segment && ctx.segment.trim());
  const hasClassCode = !!(ctx.classCode && ctx.classCode.trim());
  const hasCircuit = !!(ctx.circuit && ctx.circuit.trim());

  if (hasEventId && hasRaceId && hasSegment && hasClassCode && hasCircuit) {
    return true;
  }

  const role = auth.current?.role;
  if (role === 'mechanic_user' || role === 'scruitineer') {
    return true;
  }

  return redirectToFallback(router, auth, ['pages/dashboard']);
};

export const requireLoggerContextGuard: CanActivateFn = () => {
  const navContext = inject(NavigationContextService);
  const router = inject(Router);
  const auth = inject(AuthService);
  const ctx = navContext.snapshot;

  if (!auth.isLoggedIn()) {
    router.navigate(['/login'], { replaceUrl: true });
    return false;
  }

  if (!auth.hasPathPermission('pages/logger', 'GET')) {
    return redirectToFallback(router, auth, ['pages/logger']);
  }

  const hasRaceId = Number(ctx.raceId) > 0;
  const hasLoggerId = !!(ctx.loggerId && String(ctx.loggerId).trim());
  const hasSegment = !!(ctx.segment && ctx.segment.trim());
  const hasClassCode = !!(ctx.classCode && ctx.classCode.trim());

  if (hasRaceId && hasLoggerId && hasSegment && hasClassCode) {
    return true;
  }

  return redirectToFallback(router, auth, ['pages/logger']);
};
