import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getConfig } from "../config";
import * as schema from "./schema";

// Transaction-mode poolers reject prepared statements, so they stay off.
const client = postgres(getConfig().DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
