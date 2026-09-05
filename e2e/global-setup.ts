import { E2E_DATABASE_URL } from "./database";

// Every test resets the database itself; this only points the client at the
// e2e one before any of them import it.
export default async function globalSetup() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;
}
