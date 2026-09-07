import { setupAvailable } from "./lib/auth/setup";
import { setupToken } from "./lib/auth/setupToken";
import { getConfig } from "./lib/config";
import { reconcile } from "./lib/mail/reconcile";

// How often the sweep looks. What it picks up is decided by the claim window,
// so a deployment with no cron still recovers stalled mail on its own.
const SWEEP_MS = 2 * 60 * 1000;

async function announceSetup() {
  try {
    if (await setupAvailable()) {
      console.log(`\n  Mailroom has no accounts yet. Open /setup and use this token:\n\n    ${setupToken}\n`);
    }
  } catch {
    // The migration reports an unreachable database. This notice does not
    // need to.
  }
}

// Checked at boot rather than at first use, so a missing secret stops the app
// with a clear message instead of a 500 part way through a request.
function checkConfig() {
  try {
    getConfig();
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

async function sweep() {
  try {
    await reconcile();
  } catch {
    // A database blip is not worth stopping the timer over.
  }
}

checkConfig();
await announceSetup();

// Unreffed, so it never holds the process open by itself. A serverless process
// is short-lived and takes the timer with it, which is what the task endpoint
// is there for.
setInterval(sweep, SWEEP_MS).unref();
