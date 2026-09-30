import { Pool } from "pg";
import { loadEnv, removeFixtures } from "./support/fixtures";

// Removes every fixture row and fixture image, even after failed tests.
export default async function globalTeardown() {
  const { databaseUrl } = loadEnv();
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await removeFixtures(pool);
  } catch (err) {
    console.warn(`e2e: fixture cleanup failed (${err instanceof Error ? err.message : err}); see README "e2e".`);
  } finally {
    await pool.end();
  }
}
