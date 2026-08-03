/**
 * skill の recipes/*.json を Neon の recipes テーブルへ upsert。
 * 実行: pnpm seed:recipes （dotenv -e .env.local 経由で DATABASE_URL を渡す）
 * 探索先はデフォルトで work-os の skill dir。LEADHARVEST_RECIPES_DIR で上書き可。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { recipes } from "../drizzle/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// web/scripts → repo root は 4 つ上（web → rakurisu → 02_projects → root）
const repoRoot = path.resolve(__dirname, "../../../..");
const RECIPES_DIR =
  process.env.LEADHARVEST_RECIPES_DIR ??
  path.join(repoRoot, ".claude/skills/lead-harvest/recipes");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!fs.existsSync(RECIPES_DIR)) {
    throw new Error(`recipes dir not found: ${RECIPES_DIR}`);
  }

  const client = postgres(url, { max: 1, ssl: "require", prepare: false });
  const db = drizzle(client, { schema: { recipes } });

  const files = fs.readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json"));
  let n = 0;
  for (const f of files) {
    const json = JSON.parse(fs.readFileSync(path.join(RECIPES_DIR, f), "utf8"));
    const source: string = json.source ?? path.basename(f, ".json");
    const label: string | null = json.label ?? null;
    await db
      .insert(recipes)
      .values({ source, label, json })
      .onConflictDoUpdate({
        target: recipes.source,
        set: { label, json },
      });
    n++;
    console.log(`upserted recipe: ${source}`);
  }
  console.log(`done: ${n} recipes from ${RECIPES_DIR}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
