export type WebUserRole = 'administrator' | 'server_engineer' | 'moderator';

export interface WebUser {
  username: string;
  role?: WebUserRole | string;
  tabs?: string[];
  instance_ids?: string[];
  enabled?: boolean;
}

export interface WebAccessInstance {
  id: string;
  name?: string;
}

export interface WebUsersResponse {
  users?: WebUser[];
  instances?: WebAccessInstance[];
}
