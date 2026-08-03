"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, postJson } from "@/lib/fetcher";
import { RAKURISU_ICON } from "@/lib/brand";
import type {
  EventDTO,
  JobDetail,
  QueueResponse,
  StageDTO,
} from "@/lib/api-types";
import { NewJobModal } from "./NewJobModal";

const STAGE_LABEL: Record<string, string> = {
  crawl: "母集団収集",
  find_sites: "公式サイト特定",
  extract_phones: "本社代表電話",
  upload: "出力",
};
const STAGE_HINT: Record<string, string> = {
  crawl: "crawl.py",
  find_sites: "find_sites.py",
  extract_phones: "extract_phones.py",
  upload: "Sheets + CSV",
};

function stepCls(s: StageDTO): "ok" | "run" | "todo" {
  if (s.status === "done") return "ok";
  if (s.status === "running") return "run";
  return "todo";
}

export function Console() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: queue, mutate: mutateQueue } = useSWR<QueueResponse>(
    "/api/jobs",
    fetcher,
    { refreshInterval: 5000 }
  );

  const jobs = queue?.jobs ?? [];
  const current = activeId ?? jobs[0]?.id ?? null;

  const { data: detailRes, mutate: mutateDetail } = useSWR<{ job: JobDetail }>(
    current ? `/api/jobs/${current}` : null,
    fetcher,
    { refreshInterval: 3000 }
  );
  const detail = detailRes?.job ?? null;

  async function enqueue(jobId: string, kind: "dryrun" | "production") {
    await postJson(`/api/jobs/${jobId}/runs`, { kind });
    await Promise.all([mutateQueue(), mutateDetail()]);
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mark" src={RAKURISU_ICON} alt="ラクリス" />
          ラクリス
        </div>
        <div className="navsec">
          <div className="navlbl">ワークスペース</div>
          <nav className="nav">
            <button className="on">
              <span className="ico">▤</span>ジョブ
              <span className="badge">{jobs.length}</span>
            </button>
            <button>
              <span className="ico">◷</span>実行ログ
            </button>
            <button>
              <span className="ico">▦</span>納品シート
            </button>
            <button>
              <span className="ico">☰</span>レシピ
            </button>
          </nav>
        </div>
        <div className="side-foot">
          env <b>alphadrive</b>
          <br />
          brave / sheets 接続中
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>ジョブ</h1>
          <span className="sub num">
            本日 {queue?.todayDelivered ?? 0} 社納品 · 実行中{" "}
            {queue?.runningCount ?? 0}
          </span>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            ＋ 新規ジョブ
          </button>
        </div>

        <div className="body2">
          <aside className="queue">
            <div className="qhead">
              <span className="t">キュー</span>
              <span className="n num">{jobs.length} 件</span>
            </div>
            {jobs.length === 0 && (
              <div className="empty">
                <div className="k">キューは空です</div>
                ＋新規ジョブ で最初の案件を作成
              </div>
            )}
            {jobs.map((j) => (
              <button
                key={j.id}
                className={`job ${j.id === current ? "active" : ""}`}
                aria-pressed={j.id === current}
                onClick={() => setActiveId(j.id)}
              >
                <div className="r1">
                  <span className="code">{j.code}</span>
                  <span className={`tag ${j.tag}`}>{j.statusLabel}</span>
                </div>
                <div className="title">{j.title}</div>
                <div className="r2">
                  <span>
                    {j.useCase} · 目標 {j.target.toLocaleString()}
                  </span>
                  <span className="num">{j.kpi}</span>
                </div>
              </button>
            ))}
          </aside>

          <section className="detail">
            {!detail ? (
              <div className="loading">読み込み中…</div>
            ) : (
              <Detail detail={detail} onEnqueue={enqueue} />
            )}
          </section>
        </div>

        <div className="footnote">
          ラクリス（lead-harvest console）／ A/B パターンは純 Python で LLM 0
          トークン。実行は Python ワーカーが Neon 経由で担う。
        </div>
      </main>

      <NewJobModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={async (jobId) => {
          setModalOpen(false);
          setActiveId(jobId);
          await mutateQueue();
        }}
      />
    </div>
  );
}

function DHead({ detail, extra }: { detail: JobDetail; extra?: React.ReactNode }) {
  return (
    <div className="dhead">
      <div className="kick">
        <span className="code">{detail.code}</span>
        <span className={`tag ${detail.tag}`}>{detail.statusLabel}</span>
      </div>
      <h2>{detail.title}</h2>
      <div className="meta">
        <span>
          用途 <b>{detail.useCase}</b>
        </span>
        <span>
          パターン <b>{detail.pattern}</b>
        </span>
        <span>
          目標 <b className="num">{detail.target.toLocaleString()} 件</b>
        </span>
        {extra}
      </div>
    </div>
  );
}

function Pipeline({ stages, hint }: { stages: StageDTO[]; hint?: string }) {
  return (
    <div className="sec">
      <div className="sec-h">
        <h3>収穫パイプライン</h3>
        <span className="hint">{hint ?? "母集団 → 公式サイト → 本社代表電話 → 出力"}</span>
      </div>
      <div className="steps">
        {stages.map((s, i) => {
          const cls = stepCls(s);
          const val =
            s.status === "done" || s.status === "running"
              ? s.rate
                ? s.rate
                : `${s.count.toLocaleString()}`
              : s.status === "skipped"
              ? "skip"
              : "待機";
          const pct = s.rate
            ? parseInt(s.rate) || 0
            : s.status === "done"
            ? 100
            : 0;
          return (
            <div className={`step ${cls}`} key={s.stage}>
              <span className="no">{i + 1}</span>
              <span className="nm">
                {STAGE_LABEL[s.stage]}
                <span className="d">{STAGE_HINT[s.stage]}</span>
              </span>
              <span className="bar">
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="val num">
                {s.status === "done" && s.rate ? (
                  <b>{s.rate}</b>
                ) : (
                  val
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 上部フェーズバー（今どのフェーズにいるか） ── */
const PHASES = [
  { key: "decompose", label: "与件分解", hint: "AI がソース発見・レシピ生成" },
  { key: "dryrun", label: "試走", hint: "小ロットで歩留まり測定" },
  { key: "judge", label: "GO 判断", hint: "結果を見て本番可否" },
  { key: "production", label: "本番", hint: "全量クロール" },
  { key: "done", label: "完了", hint: "リスト納品" },
];

function phaseIndex(detail: JobDetail): number {
  const st = detail.state;
  const kind = detail.latestRun?.kind;
  if (st === "decompose") return 0;
  if (st === "draft") return 1;
  if (st === "running") return kind === "production" ? 3 : 1;
  if (st === "dryrun") return 2;
  if (st === "done") return 4;
  if (st === "error") {
    if (kind === "decompose") return 0;
    if (kind === "production") return 3;
    return 1;
  }
  return -1;
}

function PhaseBar({ detail }: { detail: JobDetail }) {
  const cur = phaseIndex(detail);
  const isError = detail.state === "error";
  return (
    <div className="phasebar" role="group" aria-label="進捗フェーズ">
      {PHASES.map((p, i) => {
        let cls: string;
        if (cur < 0) cls = "todo";
        else if (i < cur) cls = "done";
        else if (i === cur) cls = isError ? "err" : "active";
        else cls = "todo";
        return (
          <div className={`phase ${cls}`} key={p.key}>
            <span className="dot">{cls === "done" ? "✓" : cls === "err" ? "!" : i + 1}</span>
            <span className="lab">
              {p.label}
              <span className="h">{p.hint}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function headExtra(detail: JobDetail): React.ReactNode {
  const st = detail.state;
  if (st === "running")
    return <span>種別 <b>{detail.latestRun?.kind === "production" ? "本番" : "試走"}</b></span>;
  if (st === "dryrun")
    return <span>試走 <b className="num">{detail.stats.population ?? 0} 件</b></span>;
  if (st === "done" && detail.latestRun?.finishedAt)
    return <span>完了 <b>{new Date(detail.latestRun.finishedAt).toLocaleString("ja-JP")}</b></span>;
  return undefined;
}

function EventsLog({ events, title, hint }: { events: EventDTO[]; title: string; hint: string }) {
  return (
    <div className="sec">
      <div className="sec-h">
        <h3>{title}</h3>
        <span className="hint">{hint}</span>
      </div>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>時刻</th>
              <th>ステージ</th>
              <th>イベント</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={3}>まだイベントはありません</td>
              </tr>
            )}
            {events.map((e, i) => (
              <tr key={i}>
                <td className="tel">{new Date(e.ts).toLocaleTimeString("ja-JP")}</td>
                <td>{e.stage ?? ""}</td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({
  detail,
  onEnqueue,
}: {
  detail: JobDetail;
  onEnqueue: (jobId: string, kind: "dryrun" | "production") => Promise<void>;
}) {
  return (
    <>
      <DHead detail={detail} extra={headExtra(detail)} />
      <PhaseBar detail={detail} />
      <DetailBody detail={detail} onEnqueue={onEnqueue} />
    </>
  );
}

function DetailBody({
  detail,
  onEnqueue,
}: {
  detail: JobDetail;
  onEnqueue: (jobId: string, kind: "dryrun" | "production") => Promise<void>;
}) {
  const st = detail.state;

  if (st === "draft") {
    return (
      <div className="sec">
        <div className="note">
          レシピ <b>{detail.recipeSource ?? "未設定"}</b> で準備完了。まず
          <b> 試走（--limit 40）</b>で歩留まりを測り、良ければ本番へ。
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => onEnqueue(detail.id, "dryrun")}>
            試走 40 件を実行
          </button>
        </div>
      </div>
    );
  }

  if (st === "running") {
    const active = detail.stages.find((s) => s.status === "running");
    return (
      <>
        <div className="sec">
          <div className="stats">
            <div className="stat">
              <div className="k">現在</div>
              <div className="v">{active ? STAGE_LABEL[active.stage] : "起動中"}</div>
              <div className="s">{detail.latestRun?.status}</div>
            </div>
            <div className="stat">
              <div className="k">進捗</div>
              <div className="v num">
                {active ? `${active.count}${active.total ? " / " + active.total : ""}` : "—"}
              </div>
              <div className="s num">{active?.rate ?? ""}</div>
            </div>
            <div className="stat">
              <div className="k">母集団</div>
              <div className="v num">
                {detail.stats.population ?? "—"}
                <span className="unit">社</span>
              </div>
              <div className="s num">crawl</div>
            </div>
            <div className="stat">
              <div className="k">実行環境</div>
              <div className="v" style={{ fontSize: 14, lineHeight: 2 }}>caffeinate</div>
              <div className="s">夜間放置可</div>
            </div>
          </div>
        </div>
        <Pipeline stages={detail.stages} hint="実行中" />
        <EventsLog events={detail.events} title="直近のイベント" hint="worker log" />
      </>
    );
  }

  if (st === "dryrun") {
    const phone = detail.stats.phoneRate;
    const site = detail.stats.siteRate;
    const trial = detail.stats.population;
    return (
      <>
        <div className="sec">
          <div className="note ok">
            試走の電話取得率 <b>{phone ?? "—"}%</b> — 品質バー（仮 85%）
            {phone != null && phone >= 85 ? "を上回りました" : "を下回りました"}。
            結果を見て本番実行を判断してください。
          </div>
          <div className="sec" style={{ marginTop: 14 }}>
            <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="stat">
                <div className="k">試走件数</div>
                <div className="v num">
                  {trial ?? 0}
                  <span className="unit">社</span>
                </div>
                <div className="s">limit 40</div>
              </div>
              <div className="stat">
                <div className="k">公式サイト率</div>
                <div className="v num">{site != null ? `${site}%` : "—"}</div>
                <div className="s num">find_sites</div>
              </div>
              <div className="stat">
                <div className="k">電話取得率</div>
                <div className="v num">{phone != null ? `${phone}%` : "—"}</div>
                <div className="s num">extract_phones</div>
              </div>
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => onEnqueue(detail.id, "production")}>
              本番実行 GO
            </button>
            <button className="btn" onClick={() => onEnqueue(detail.id, "dryrun")}>
              試走をやり直す
            </button>
          </div>
        </div>
        <Pipeline stages={detail.stages} hint="試走 Stage 0.5" />
      </>
    );
  }

  if (st === "done") {
    const s = detail.stats;
    return (
      <>
        <div className="sec">
          <div className="stats">
            <div className="stat">
              <div className="k">納品</div>
              <div className="v num">
                {s.delivered ?? 0}
                <span className="unit">件</span>
              </div>
              <div className="s num">母集団 {s.population ?? "—"} 社</div>
            </div>
            <div className="stat">
              <div className="k">本社代表電話</div>
              <div className="v num">{s.phoneRate != null ? `${s.phoneRate}%` : "—"}</div>
              <div className="s num">合格ライン 85%</div>
            </div>
            <div className="stat">
              <div className="k">公式サイト</div>
              <div className="v num">{s.siteRate != null ? `${s.siteRate}%` : "—"}</div>
              <div className="s num">find_sites</div>
            </div>
            <div className="stat">
              <div className="k">要確認</div>
              <div className="v num">
                {s.flagged ?? 0}
                <span className="unit">件</span>
              </div>
              <div className="s">架電前の目視対象</div>
            </div>
          </div>
          {s.tiers.length > 0 && (
            <div className="note ok">
              Tier 内訳:{" "}
              {s.tiers.map((t) => `${t.tier} ${t.count}`).join(" · ")}
            </div>
          )}
        </div>
        <Pipeline stages={detail.stages} />
        <div className="sec">
          <div className="sec-h">
            <h3>出力</h3>
            <span className="hint">Stage 4 納品物</span>
          </div>
          <div className="linkrow">
            {detail.latestRun?.sheetUrl ? (
              <a className="filelink" href={detail.latestRun.sheetUrl} target="_blank" rel="noreferrer">
                <span>
                  <span className="t">Google スプレッドシート</span>
                  <br />
                  <span className="u">{detail.latestRun.sheetUrl}</span>
                </span>
              </a>
            ) : (
              <span className="code">Sheet 未生成（token 無 → CSV のみ）</span>
            )}
            {detail.latestRun?.csvPath && (
              <span className="code">{detail.latestRun.csvPath}</span>
            )}
          </div>
        </div>
        <div className="sec">
          <div className="sec-h">
            <h3>プレビュー</h3>
            <span className="hint">上位 5 社</span>
          </div>
          <div className="tblwrap">
            <table>
              <thead>
                <tr>
                  <th>会社名</th>
                  <th>本社代表電話</th>
                  <th>Tier</th>
                  <th>都道府県</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {detail.leadsPreview.length === 0 && (
                  <tr>
                    <td colSpan={5}>リードがありません</td>
                  </tr>
                )}
                {detail.leadsPreview.map((l, i) => (
                  <tr key={i}>
                    <td className="nm">{l.company}</td>
                    <td className="tel">{l.phone}</td>
                    <td>{l.tier}</td>
                    <td>{l.prefecture}</td>
                    <td>
                      <span className={`tag ${l.verdict === "good" ? "done" : "wait"}`}>
                        {l.verdict ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  if (st === "error") {
    const failedAt = detail.latestRun?.kind;
    return (
      <>
        <div className="sec">
          <div className="note flag">
            {failedAt === "decompose" ? "与件分解に失敗しました" : "実行に失敗しました"}:{" "}
            <b>{detail.latestRun?.error ?? "不明なエラー"}</b>
          </div>
          <div className="actions">
            {detail.recipeSource ? (
              <button className="btn btn-primary" onClick={() => onEnqueue(detail.id, "dryrun")}>
                試走から再実行
              </button>
            ) : (
              <div className="note">
                レシピが未確定のため、<b>新規ジョブ</b>で与件の表現を変えてお試しください
                （ディレクトリが見つからない／対象が C・D パターンの可能性）。
              </div>
            )}
          </div>
        </div>
        {detail.events.length > 0 && (
          <EventsLog events={detail.events} title="ログ" hint="worker log" />
        )}
      </>
    );
  }

  // decompose — AI（Gemini + Brave）が与件を分解しレシピを自動生成中
  const dq = detail.latestRun?.status;
  return (
    <>
      <div className="sec">
        <div className="note">
          与件: <b>{detail.brief ?? "（未入力）"}</b>
          <br />
          AI が構造化ソースを発見し、抽出レシピを自動生成 → そのまま試走（dryrun）まで自走します。
        </div>
        {dq === "queued" && (
          <div className="note flag">
            ワーカー起動待ち — Mac でワーカーを起動すると与件分解が始まります。
            <br />
            <span className="code">cd worker &amp;&amp; .venv/bin/python run_worker.py</span>
          </div>
        )}
        {dq === "running" && (
          <div className="note ok">
            AI が与件を分解中… 下のログにソース発見〜レシピ生成の進捗が出ます（数分）。
          </div>
        )}
        {dq === "error" && (
          <div className="note flag">
            与件分解に失敗: <b>{detail.latestRun?.error ?? "不明なエラー"}</b>
          </div>
        )}
      </div>
      <EventsLog events={detail.events} title="与件分解ログ" hint="Gemini / Brave" />
    </>
  );
}
