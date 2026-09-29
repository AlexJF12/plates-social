import { getDb } from "@/lib/db";
import { getMigrator } from "@/lib/db/migrations";

async function main() {
  const { error, results } = await getMigrator().migrateToLatest();
  for (const r of results ?? []) {
    console.log(`${r.status}: ${r.migrationName}`);
  }
  await getDb().destroy();
  if (error) throw error;
  console.log("Migrations complete.");
}

main();
