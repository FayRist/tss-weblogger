import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService, Role } from './auth.service';

function redirectToAllowedPath(auth: AuthService, router: Router, excludePaths: string[] = []): false {
  const fallbackPath = auth.getFirstAllowedPath(excludePaths);
  if (fallbackPath) {
    router.navigateByUrl(`/${fallbackPath}`, { replaceUrl: true });
    return false;
  }

  auth.logoutDueToMissingPermissions();
  return false;
}

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const roles = (route.data?.['roles'] as Role[]) ?? [];
  const permissionPath = String(route.data?.['permissionPath'] ?? '').trim();
  const permissionType = String(route.data?.['permissionType'] ?? 'GET').trim() || 'GET';
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login'], { replaceUrl: true });
    return false;
  }

  if (permissionPath) {
    if (auth.hasPathPermission(permissionPath, permissionType)) return true;
    return redirectToAllowedPath(auth, router);
  }

  const routePath = String(route.routeConfig?.path ?? '').trim();
  let normalizedRoutePath = '';
  if (routePath) {
    normalizedRoutePath = routePath.startsWith('pages/') ? routePath : `pages/${routePath}`;
    if (auth.hasPathPermission(normalizedRoutePath, 'GET')) return true;
    return redirectToAllowedPath(auth, router, [normalizedRoutePath]);
  }

  if (roles.length === 0 || auth.hasAnyRole(...roles)) return true;
  return redirectToAllowedPath(auth, router, normalizedRoutePath ? [normalizedRoutePath] : []);
};
