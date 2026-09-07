import { createInterface } from "node:readline/promises";
import { createUser } from "../src/lib/auth/users";

const rl = createInterface({ input: process.stdin, output: process.stdout });

const email = await rl.question("email: ");
const password = await rl.question("password: ");
rl.close();

try {
  const user = await createUser(email, password);
  console.log(`created ${user.email}`);
  console.log("Sign in and you will be asked to set up two-factor.");
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
