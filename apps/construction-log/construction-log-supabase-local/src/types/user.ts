export type AppRole = 'master' | 'admin' | 'site_manager' | 'foreman' | 'reader' | 'ofi';

export interface UserProfile {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  role?: AppRole;
  approved?: boolean;
  created_at?: string;
  updated_at?: string;
  organization_id?: string;
}

export interface WorkAssignment {
  id: string;
  user_id: string;
  work_id: string;
  created_at?: string;
  created_by?: string;
}

export interface UserWithAssignments extends UserProfile {
  roles: AppRole[];
  assigned_works: string[];
}
