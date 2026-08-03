/**
 * Web API の DTO（client / server 共有）。server-only を付けない。
 * UI（quiet モック）の状態に直結: queue=JobSummary、detail=JobDetail。
 */

export type JobState =
  | "draft"
  | "decompose"
  | "dryrun"
  | "running"
  | "done"
  | "error";

export type TagKind = "done" | "run" | "wait" | "split";

export type JobSummary = {
  id: string;
  code: string;
  title: string;
  useCase: string;
  pattern: string;
  target: number;
  state: JobState;
  statusLabel: string;
  tag: TagKind;
  kpi: string;
};

export type QueueResponse = {
  jobs: JobSummary[];
  tally: { done: number; run: number; wait: number; split: number };
  todayDelivered: number;
  runningCount: number;
};

export type StageDTO = {
  stage: "crawl" | "find_sites" | "extract_phones" | "upload";
  status: "pending" | "running" | "done" | "error" | "skipped";
  count: number;
  total: number | null;
  rate: string | null;
};

export type LeadDTO = {
  company: string | null;
  tier: string | null;
  phone: string | null;
  prefecture: string | null;
  verdict: string | null;
};

export type EventDTO = {
  ts: string;
  stage: string | null;
  message: string;
};

export type RunDTO = {
  id: string;
  kind: "dryrun" | "production" | "validation";
  status: "queued" | "running" | "done" | "error" | "canceled";
  limitN: number | null;
  currentStage: string | null;
  sheetUrl: string | null;
  csvPath: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobDetail = {
  id: string;
  code: string;
  title: string;
  useCase: string;
  pattern: string;
  target: number;
  brief: string | null;
  state: JobState;
  statusLabel: string;
  tag: TagKind;
  recipeSource: string | null;
  latestRun: RunDTO | null;
  stages: StageDTO[];
  leadsPreview: LeadDTO[];
  events: EventDTO[];
  stats: {
    delivered: number | null;
    population: number | null;
    phoneRate: number | null;
    siteRate: number | null;
    flagged: number | null;
    tiers: { tier: string; count: number }[];
  };
};

export type RecipeSummary = {
  id: string;
  source: string;
  label: string | null;
};

export type CreateJobInput = {
  title: string;
  useCase: string;
  target: number;
  compliance?: string;
  brief?: string;
  recipeId?: string | null;
};
