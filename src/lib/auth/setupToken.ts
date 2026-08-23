import { randomBytes } from "node:crypto";

// Regenerated per process and printed only while the instance has no users, so
// the setup screen cannot be claimed by whoever finds the URL first.
export const setupToken = process.env.SETUP_TOKEN ?? randomBytes(16).toString("hex");
