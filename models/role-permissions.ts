export type Role = 'Admin' | 'User';

export interface Permission {
  canViewMatch: boolean;
  canEditMatch: boolean;
  canAddRacer: boolean;
  canEditRacer: boolean;
}

export const RolePermissions: Record<Role, Permission> = {
  Admin: {
    canViewMatch: true,
    canEditMatch: true,
    canAddRacer: true,
    canEditRacer: true
  },
  User: {
    canViewMatch: true,
    canEditMatch: false,
    canAddRacer: false,
    canEditRacer: false
  }
};
