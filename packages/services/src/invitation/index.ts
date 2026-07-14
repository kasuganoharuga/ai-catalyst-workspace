// Scaffold only — no implementation yet. Will own the invitation
// acceptance transaction described in
// infra/database/migrations/0001_aidb_v5_baseline.sql: lock invitation,
// check pending + not expired, normalize + compare email, upgrade role,
// create/bind workspace, mark accepted, revoke other pending invitations
// for the same email — all in one transaction.
export {};
