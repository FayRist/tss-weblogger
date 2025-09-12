import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService, Role } from './auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const roles = (route.data?.['roles'] as Role[]) ?? [];
  const auth = inject(AuthService);
  const router = inject(Router);
  if (roles.length === 0 || auth.hasAnyRole(...roles)) return true;
  // ไม่มีสิทธิ์ → ส่งไปหน้า dashboard (หรือ 403 page)
  router.navigate(['/pages/dashboard']);
  router.navigate(['/pages/logger']);
  return false;
};
