/**
 * Admin domain barrel — user directory, dashboard stats, mentor
 * assignment, and break-glass password recovery.
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
export {
  listAdminUsers,
  listAssignableMentors,
  softDeleteUser,
} from "@ai-catalyst/services/admin/users";
export { getAdminDashboardStats } from "@ai-catalyst/services/admin/dashboard";
export { assignWorkspaceMentor } from "@ai-catalyst/services/admin/mentor-assignment";
export {
  generateTemporaryPassword,
  resetUserPassword,
  type AdminPasswordResetResult,
  type ResetUserPasswordInput,
} from "@ai-catalyst/services/admin/password-recovery";
