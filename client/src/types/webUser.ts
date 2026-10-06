import type { UserRole } from '@fcc/shared/fcc-roles';

export type WebUserRole = UserRole;

export interface WebUser {
  username: string;
  role?: WebUserRole;
  tabs?: string[];
  instance_ids?: string[];
  enabled?: boolean;
  twoFactorEnabled?: boolean;
}

export interface WebAccessInstance {
  id: string;
  name?: string;
}

export interface WebUsersResponse {
  users?: WebUser[];
  instances?: WebAccessInstance[];
}
