import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * ラクリス — lead-harvest console のデータモデル。
 * enum は text + アプリ層(zod)で検証（DB CHECK は drizzle-kit push の摩擦を避けて省略）。
 * 日付は timestamptz。JSON は jsonb。
 *
 * Web は jobs/runs を書き、runs を 'queued' で積むだけ。
 * Python ワーカーが 'queued' を拾って実行し、run_stages / leads / events を書き戻す。
 */

// ── 認証 ────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // 'admin' | 'member'
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── レシピ（構造化ソース定義） ────────────────────────────
export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().unique(), // recipe key, e.g. "hotpepper-beauty-work"
  label: text("label"),
  json: jsonb("json").notNull(), // レシピ全体（sitemap/url_pattern/fields/filter/tier）
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── ジョブ（案件） ──────────────────────────────────────
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // 表示用 ID, e.g. "LH-A07"
    title: text("title").notNull(),
    useCase: text("use_case").notNull().default("架電営業"), // 用途
    pattern: text("pattern").notNull().default("?"), // A | B | C | D | ?
    target: integer("target").notNull().default(0), // 目標納品件数
    compliance: text("compliance"),
    columns: jsonb("columns"), // 提案カラム
    qualityBar: jsonb("quality_bar"),
    brief: text("brief"), // 与件テキスト（ふわっと依頼）
    recipeId: uuid("recipe_id").references(() => recipes.id),
    // draft | decompose | dryrun | running | done | error
    state: text("state").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("jobs_code_uq").on(t.code)]
);

// ── 実行（試走 / 本番） ─────────────────────────────────
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("dryrun"), // dryrun | production | validation
    // queued | running | done | error | canceled
    status: text("status").notNull().default("queued"),
    limitN: integer("limit_n"), // crawl --limit
    currentStage: text("current_stage"),
    sheetUrl: text("sheet_url"),
    csvPath: text("csv_path"),
    metaJson: jsonb("meta_json"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_status_idx").on(t.status), index("runs_job_idx").on(t.jobId)]
);

// ── 段階進捗 ───────────────────────────────────────────
export const runStages = pgTable(
  "run_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    // crawl | find_sites | extract_phones | upload
    stage: text("stage").notNull(),
    // pending | running | done | error | skipped
    status: text("status").notNull().default("pending"),
    count: integer("count").notNull().default(0),
    total: integer("total"),
    rate: text("rate"), // 例 "86%"
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("run_stages_uq").on(t.runId, t.stage)]
);

// ── リード（納品行） ────────────────────────────────────
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    company: text("company"),
    tier: text("tier"),
    address: text("address"),
    prefecture: text("prefecture"),
    officialSite: text("official_site"),
    phone: text("phone"),
    phoneNote: text("phone_note"),
    phoneFlag: text("phone_flag"),
    sourceUrl: text("source_url"),
    shops: integer("shops"),
    brands: jsonb("brands"),
    business: text("business"),
    verdict: text("verdict"), // good | 要確認 | なし
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("leads_run_idx").on(t.runId)]
);

// ── ライブログ ─────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    stage: text("stage"),
    message: text("message").notNull(),
  },
  (t) => [index("events_run_idx").on(t.runId)]
);
