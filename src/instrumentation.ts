export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { setupAvailable } = await import("./lib/auth/setup");
  const { setupToken } = await import("./lib/auth/setupToken");

  try {
    if (await setupAvailable()) {
      console.log(`\n  Mailroom has no accounts yet. Open /setup and use this token:\n\n    ${setupToken}\n`);
    }
  } catch {
    // The migration reports an unreachable database. This notice does not
    // need to.
  }
}
