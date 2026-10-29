export const ALLOWED_TRANSITIONS = Object.freeze({
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ASSIGNED', 'REJECTED'],
  ASSIGNED: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  REJECTED: [],
  CLOSED: []
});

export function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
}

export function roleMayChangeStatus(role, from, to, assignedToDepartment = false) {
  if (!canTransition(from, to)) return false;
  if (role === 'ADMIN') return true;
  if (role !== 'DEPARTMENT' || !assignedToDepartment) return false;
  return ['IN_PROGRESS', 'RESOLVED'].includes(to) && ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(from);
}
