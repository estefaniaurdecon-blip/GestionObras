/**
 * workReportsSupabaseGateway.ts
 *
 * Legacy-named adapter retained only for active callers still importing it.
 * All Supabase references have been removed.
 */
import {
  getCurrentUser,
  listManagedUserAssignments,
  listManagedUsers,
  listProjects,
} from '@/integrations/api/client';

export type AssignedWorkRow = {
  id: string;
  number: string;
  name: string;
};

export const listAssignedWorksByUser = async (
  userId: string | number,
): Promise<AssignedWorkRow[]> => {
  const [workIds, allProjects] = await Promise.all([
    listManagedUserAssignments(Number(userId)),
    listProjects(),
  ]);
  if (workIds.length === 0) return [];

  const workIdSet = new Set(workIds);
  return allProjects
    .filter((project) => workIdSet.has(project.id))
    .map((project) => ({
      id: String(project.id),
      number: String(project.code ?? project.id),
      name: project.name,
    }));
};

export const listProfileNamesByIds = async (
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null }>> => {
  if (userIds.length === 0) return [];
  const allUsers = await listManagedUsers();
  const idSet = new Set(userIds.map(String));
  return allUsers
    .filter((user) => idSet.has(String(user.id)))
    .map((user) => ({ id: String(user.id), full_name: user.full_name ?? null }));
};

export const getUserProfileFullName = async (userId: string | number): Promise<string | null> => {
  try {
    const me = await getCurrentUser();
    if (String(me.id) === String(userId)) return me.full_name ?? null;
    const allUsers = await listManagedUsers();
    const found = allUsers.find((user) => String(user.id) === String(userId));
    return found?.full_name ?? null;
  } catch {
    return null;
  }
};
