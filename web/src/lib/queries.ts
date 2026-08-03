import "server-only";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { jobs, recipes, runs, runStages, leads, events } from "../../drizzle/schema";
import type {
  CreateJobInput,
  EventDTO,
  JobDetail,
  JobState,
  JobSummary,
  LeadDTO,
  QueueResponse,
  RecipeSummary,
  RunDTO,
  StageDTO,
  TagKind,
} from "./api-types";

const STAGE_LABEL: Record<string, string> = {
  crawl: "母集団収集",
  find_sites: "公式サイト特定",
  extract_phones: "本社代表電話",
  upload: "出力",
};

export function statusLabelFor(state: JobState): string {
  return {
    draft: "下書き",
    decompose: "与件分解",
    dryrun: "GO 待ち",
    running: "実行中",
    done: "完了",
    error: "エラー",
  }[state];
}

export function tagFor(state: JobState): TagKind {
  return {
    draft: "split",
    decompose: "split",
    dryrun: "wait",
    running: "run",
    done: "done",
    error: "wait",
  }[state] as TagKind;
}

function pctFromRate(rate: string | null): number | null {
  if (!rate) return null;
  const m = rate.match(/([\d.]+)\s*%/);
  return m ? Math.round(parseFloat(m[1])) : null;
}

async function latestRun(jobId: string) {
  const r = await db
    .select()
    .from(runs)
    .where(eq(runs.jobId, jobId))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return r[0] ?? null;
}

async function stagesFor(runId: string) {
  return db.select().from(runStages).where(eq(runStages.runId, runId));
}

function orderedStages(rows: Awaited<ReturnType<typeof stagesFor>>): StageDTO[] {
  const order = ["crawl", "find_sites", "extract_phones", "upload"];
  return order.map((stage) => {
    const s = rows.find((x) => x.stage === stage);
    return {
      stage: stage as StageDTO["stage"],
      status: (s?.status ?? "pending") as StageDTO["status"],
      count: s?.count ?? 0,
      total: s?.total ?? null,
      rate: s?.rate ?? null,
    };
  });
}

function kpiFor(state: JobState, stages: StageDTO[], target: number): string {
  const find = (st: string) => stages.find((s) => s.stage === st);
  switch (state) {
    case "done": {
      const r = find("extract_phones")?.rate ?? find("upload")?.rate;
      return r ? `電話 ${r}` : "完了";
    }
    case "running": {
      const active = stages.find((s) => s.status === "running");
      const pct = pctFromRate(active?.rate ?? null);
      const label = active ? STAGE_LABEL[active.stage] : "実行中";
      return pct != null ? `${label} · ${pct}%` : label;
    }
    case "dryrun": {
      const r = find("extract_phones")?.rate;
      return r ? `試走 ${r}` : "試走";
    }
    case "decompose":
      return "与件分解";
    case "error":
      return "エラー";
    default:
      return `目標 ${target.toLocaleString()}`;
  }
}

export async function listQueue(): Promise<QueueResponse> {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.updatedAt));
  const summaries: JobSummary[] = [];
  const tally = { done: 0, run: 0, wait: 0, split: 0 };
  let runningCount = 0;

  for (const j of rows) {
    const state = j.state as JobState;
    const run = await latestRun(j.id);
    const stages = run ? orderedStages(await stagesFor(run.id)) : [];
    const tag = tagFor(state);
    tally[tag]++;
    if (state === "running") runningCount++;
    summaries.push({
      id: j.id,
      code: j.code,
      title: j.title,
      useCase: j.useCase,
      pattern: j.pattern,
      target: j.target,
      state,
      statusLabel: statusLabelFor(state),
      tag,
      kpi: kpiFor(state, stages, j.target),
    });
  }

  // 本日納品: 今日 finish した done run の leads 合計
  const delivered = await db
    .select({ n: sql<number>`coalesce(count(${leads.id}),0)::int` })
    .from(leads)
    .innerJoin(runs, eq(leads.runId, runs.id))
    .where(and(eq(runs.status, "done"), sql`${runs.finishedAt} >= now() - interval '1 day'`));

  return {
    jobs: summaries,
    tally,
    todayDelivered: delivered[0]?.n ?? 0,
    runningCount,
  };
}

export async function getJobDetail(id: string): Promise<JobDetail | null> {
  const jr = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  const j = jr[0];
  if (!j) return null;
  const state = j.state as JobState;

  let recipeSource: string | null = null;
  if (j.recipeId) {
    const rc = await db
      .select({ source: recipes.source })
      .from(recipes)
      .where(eq(recipes.id, j.recipeId))
      .limit(1);
    recipeSource = rc[0]?.source ?? null;
  }

  const run = await latestRun(j.id);
  const stageRows = run ? await stagesFor(run.id) : [];
  const stages = orderedStages(stageRows);

  let leadsPreview: LeadDTO[] = [];
  let evts: EventDTO[] = [];
  const stats: JobDetail["stats"] = {
    delivered: null,
    population: null,
    phoneRate: null,
    siteRate: null,
    flagged: null,
    tiers: [],
  };

  if (run) {
    const lp = await db
      .select()
      .from(leads)
      .where(eq(leads.runId, run.id))
      .orderBy(desc(leads.shops))
      .limit(5);
    leadsPreview = lp.map((l) => ({
      company: l.company,
      tier: l.tier,
      phone: l.phone,
      prefecture: l.prefecture,
      verdict: l.verdict,
    }));

    const ev = await db
      .select()
      .from(events)
      .where(eq(events.runId, run.id))
      .orderBy(desc(events.ts))
      .limit(8);
    evts = ev.map((e) => ({
      ts: e.ts.toISOString(),
      stage: e.stage,
      message: e.message,
    }));

    stats.population = stages.find((s) => s.stage === "crawl")?.count ?? null;
    stats.delivered = stages.find((s) => s.stage === "upload")?.count ?? null;
    stats.phoneRate = pctFromRate(stages.find((s) => s.stage === "extract_phones")?.rate ?? null);
    stats.siteRate = pctFromRate(stages.find((s) => s.stage === "find_sites")?.rate ?? null);

    const flagged = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.runId, run.id), isNotNull(leads.phoneFlag), ne(leads.phoneFlag, "")));
    stats.flagged = flagged[0]?.n ?? 0;

    const tierRows = await db
      .select({ tier: leads.tier, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.runId, run.id), isNotNull(leads.tier)))
      .groupBy(leads.tier);
    stats.tiers = tierRows
      .filter((t) => t.tier)
      .map((t) => ({ tier: t.tier as string, count: t.n }));
  }

  const runDTO: RunDTO | null = run
    ? {
        id: run.id,
        kind: run.kind as RunDTO["kind"],
        status: run.status as RunDTO["status"],
        limitN: run.limitN,
        currentStage: run.currentStage,
        sheetUrl: run.sheetUrl,
        csvPath: run.csvPath,
        error: run.error,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
      }
    : null;

  return {
    id: j.id,
    code: j.code,
    title: j.title,
    useCase: j.useCase,
    pattern: j.pattern,
    target: j.target,
    brief: j.brief,
    state,
    statusLabel: statusLabelFor(state),
    tag: tagFor(state),
    recipeSource,
    latestRun: runDTO,
    stages,
    leadsPreview,
    events: evts,
    stats,
  };
}

export async function listRecipes(): Promise<RecipeSummary[]> {
  const rows = await db
    .select({ id: recipes.id, source: recipes.source, label: recipes.label })
    .from(recipes)
    .orderBy(recipes.source);
  return rows;
}

export async function createJob(input: CreateJobInput) {
  const count = await db.select({ n: sql<number>`count(*)::int` }).from(jobs);
  const seq = (count[0]?.n ?? 0) + 1;
  const code = `LH-A${String(seq).padStart(2, "0")}`;

  // レシピ指定があれば pattern をレシピ由来にする余地（今は A 既定）。無ければ '?'（与件分解対象）。
  const pattern = input.recipeId ? "A" : "?";
  const state: JobState = input.recipeId ? "draft" : "decompose";

  const inserted = await db
    .insert(jobs)
    .values({
      code,
      title: input.title,
      useCase: input.useCase,
      target: input.target,
      compliance: input.compliance ?? null,
      brief: input.brief ?? null,
      recipeId: input.recipeId ?? null,
      pattern,
      state,
    })
    .returning();
  const job = inserted[0];

  // レシピ無し（与件分解対象）は decompose run を自動投入する。
  // worker が Gemini で分解 → レシピ生成 → dryrun 自動投入まで自走する。
  // job.state は "decompose" のまま（enqueueRun と違い running に上げない）。
  if (!input.recipeId) {
    await db
      .insert(runs)
      .values({ jobId: job.id, kind: "decompose", status: "queued", limitN: null });
  }
  return job;
}

export async function enqueueRun(
  jobId: string,
  kind: "dryrun" | "production",
  limitN: number | null
) {
  const inserted = await db
    .insert(runs)
    .values({ jobId, kind, status: "queued", limitN })
    .returning();
  // キュー投入時点で running 表示。ワーカーが完了時に最終状態を書く
  // （dryrun→'dryrun'(GO待ち) / production→'done' / 失敗→'error'）。
  await db
    .update(jobs)
    .set({ state: "running", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return inserted[0];
}
