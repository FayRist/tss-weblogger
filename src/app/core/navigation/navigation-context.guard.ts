import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavigationContextService } from './navigation-context.service';

function redirectToEvent(router: Router): false {
  router.navigate(['/pages', 'event'], { replaceUrl: true });
  return false;
}

export const requireDashboardContextGuard: CanActivateFn = () => {
  const navContext = inject(NavigationContextService);
  const router = inject(Router);
  const ctx = navContext.snapshot;

  const hasEventId = Number(ctx.eventId) > 0;
  const hasRaceId = Number(ctx.raceId) > 0;
  const hasSegment = !!(ctx.segment && ctx.segment.trim());
  const hasClassCode = !!(ctx.classCode && ctx.classCode.trim());
  const hasCircuit = !!(ctx.circuit && ctx.circuit.trim());

  if (hasEventId && hasRaceId && hasSegment && hasClassCode && hasCircuit) {
    return true;
  }

  return redirectToEvent(router);
};

export const requireLoggerContextGuard: CanActivateFn = () => {
  const navContext = inject(NavigationContextService);
  const router = inject(Router);
  const ctx = navContext.snapshot;

  const hasRaceId = Number(ctx.raceId) > 0;
  const hasLoggerId = !!(ctx.loggerId && String(ctx.loggerId).trim());
  const hasSegment = !!(ctx.segment && ctx.segment.trim());
  const hasClassCode = !!(ctx.classCode && ctx.classCode.trim());

  if (hasRaceId && hasLoggerId && hasSegment && hasClassCode) {
    return true;
  }

  return redirectToEvent(router);
};
