import { Pool } from "pg";
import { createFixtures, loadEnv } from "./support/fixtures";

// Creates the signed-in suite's fixture rows (e2e/support/fixtures.ts).
// Without DATABASE_URL and SESSION_SECRET (from .env.local), or with
// Postgres down, the signed-in tests skip instead of failing.
export default async function globalSetup() {
  const { databaseUrl, secret } = loadEnv();
  if (!databaseUrl || !secret) {
    console.warn("e2e: DATABASE_URL or SESSION_SECRET missing (.env.local); signed-in tests will be skipped.");
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { photoPath, image } = await createFixtures(pool);
    process.env.E2E_IMAGE = JSON.stringify(image);
    process.env.E2E_FIXTURES = "1";
    process.env.E2E_PHOTO = photoPath;
  } catch (err) {
    console.warn(`e2e: couldn't create fixtures (${err instanceof Error ? err.message : err}); signed-in tests will be skipped.`);
  } finally {
    await pool.end();
  }
}
