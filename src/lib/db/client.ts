import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

function connect(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Transaction-mode poolers reject prepared statements, so they stay off.
  return drizzle(postgres(url, { prepare: false }), { schema });
}

// Connecting on first use rather than on import keeps the build from needing a
// database: Next imports every route module to collect page data.
export const db = new Proxy({} as Database, {
  get(_target, property) {
    instance ??= connect();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
