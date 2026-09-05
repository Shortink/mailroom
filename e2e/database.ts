// The browser tests keep their own database so a run never touches the
// development one.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:mail@localhost:55432/mail_e2e";
