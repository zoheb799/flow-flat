import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: postgres.Sql | undefined;
let database: PostgresJsDatabase<typeof schema> | undefined;

export function getDb(): PostgresJsDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to access the database.");
  }

  if (!client) {
    client = postgres(url, { max: 10, prepare: false });
    database = drizzle(client, { schema });
  }

  if (!database) throw new Error("Database client initialization failed.");
  return database;
}

export { schema };
