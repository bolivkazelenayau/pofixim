import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

declare global {
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

// Use a singleton postgres.js client to avoid connection leaks in dev/HMR.
const singletonClient = globalThis.__pgClient ?? postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

if (!globalThis.__pgClient) {
  globalThis.__pgClient = singletonClient;
}

export const db = drizzle(singletonClient, { schema });
