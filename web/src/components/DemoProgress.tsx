"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoList } from "@/data/demo-lists";

/**
 * 展示デモ用の「リスト作成中」演出。
 * worker も LLM も呼ばず、既存 Console の Pipeline/EventsLog と同じ CSS クラスで
 * lead-harvest の語彙（母集団→公式サイト→本社代表電話→出力）をスクリプト再生する。
 * 完了で onDone() を呼び、SavedLists 側の「今作成」リストに着地する。
 */

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

// 各ステージの終了時刻（ms）。合計 ~16s。
const T = {
  crawlEnd: 4800,
  siteEnd: 9200,
  phoneEnd: 14200,
  uploadEnd: 16200,
  total: 17000,
};

const SITE_RATE = 92;
const PHONE_RATE = 86;

type Stage = {
  stage: "crawl" | "find_sites" | "extract_phones" | "upload";
  status: "pending" | "running" | "done";
  count: number;
  total: number | null;
  rate: string | null;
};

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function buildStages(el: number, pop: number, delivered: number): Stage[] {
  // crawl
  const crawl: Stage =
    el >= T.crawlEnd
      ? { stage: "crawl", status: "done", count: pop, total: pop, rate: null }
      : {
          stage: "crawl",
          status: "running",
          count: lerp(0, pop, el / T.crawlEnd),
          total: pop,
          rate: null,
        };
  // find_sites
  const site: Stage =
    el >= T.siteEnd
      ? { stage: "find_sites", status: "done", count: pop, total: pop, rate: `${SITE_RATE}%` }
      : el >= T.crawlEnd
      ? {
          stage: "find_sites",
          status: "running",
          count: pop,
          total: pop,
          rate: `${lerp(0, SITE_RATE, (el - T.crawlEnd) / (T.siteEnd - T.crawlEnd))}%`,
        }
      : { stage: "find_sites", status: "pending", count: 0, total: null, rate: null };
  // extract_phones
  const phone: Stage =
    el >= T.phoneEnd
      ? { stage: "extract_phones", status: "done", count: delivered, total: delivered, rate: `${PHONE_RATE}%` }
      : el >= T.siteEnd
      ? {
          stage: "extract_phones",
          status: "running",
          count: lerp(0, delivered, (el - T.siteEnd) / (T.phoneEnd - T.siteEnd)),
          total: delivered,
          rate: `${lerp(0, PHONE_RATE, (el - T.siteEnd) / (T.phoneEnd - T.siteEnd))}%`,
        }
      : { stage: "extract_phones", status: "pending", count: 0, total: null, rate: null };
  // upload
  const upload: Stage =
    el >= T.uploadEnd
      ? { stage: "upload", status: "done", count: delivered, total: delivered, rate: "100%" }
      : el >= T.phoneEnd
      ? { stage: "upload", status: "running", count: delivered, total: delivered, rate: null }
      : { stage: "upload", status: "pending", count: 0, total: null, rate: null };
  return [crawl, site, phone, upload];
}

type Ev = { at: number; stage: string; message: string };

function buildEvents(el: number, base: DemoList, baseTs: number) {
  const script: Ev[] = [
    { at: 200, stage: "crawl", message: "母集団を特定中… 業種 × 規模 × 地理でクロール" },
    { at: 2400, stage: "crawl", message: `候補 ${base.population.toLocaleString()} 社を収集` },
    { at: 4800, stage: "find_sites", message: "観測シグナルで絞り込み（受賞 / 専門部門 / 育成投資）" },
    { at: 7000, stage: "find_sites", message: `公式サイト特定 … ${SITE_RATE}%` },
    { at: 9200, stage: "extract_phones", message: "本社代表電話を取得中…" },
    { at: 11600, stage: "extract_phones", message: `電話取得率 ${PHONE_RATE}% — 品質バー 85% を上回りました` },
    { at: 14200, stage: "upload", message: "Tier 判定・整形して出力" },
    { at: 15600, stage: "upload", message: "CSV 出力 → 納品リストを格納" },
    { at: 16400, stage: "", message: "✓ 完了" },
  ];
  // 新しい順に並べる（EventsLog は上が最新）
  return script
    .filter((e) => e.at <= el)
    .reverse()
    .map((e) => ({
      ts: new Date(baseTs + e.at).toISOString(),
      stage: e.stage || null,
      message: e.message,
    }));
}

function stepCls(s: Stage): "ok" | "run" | "todo" {
  if (s.status === "done") return "ok";
  if (s.status === "running") return "run";
  return "todo";
}

export function DemoProgress({
  title,
  useCase,
  target,
  base,
  onDone,
  onCancel,
}: {
  title: string;
  useCase: string;
  target: number;
  base: DemoList;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [el, setEl] = useState(0);
  const baseTs = useRef<number>(Date.now()).current;
  const doneRef = useRef(false);
  const start = useRef<number>(Date.now()).current;
  const delivered = base.rows.length > 0 ? Math.max(base.rows.length, Math.min(target, base.population)) : target;

  useEffect(() => {
    const id = setInterval(() => {
      const cur = Date.now() - start;
      if (cur >= T.total) {
        setEl(T.total);
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      } else {
        setEl(cur);
      }
    }, 80);
    return () => clearInterval(id);
    // start/onDone は安定参照
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  const stages = useMemo(
    () => buildStages(el, base.population, delivered),
    [el, base.population, delivered]
  );
  const events = useMemo(() => buildEvents(el, base, baseTs), [el, base, baseTs]);
  const pct = Math.round((Math.min(el, T.total) / T.total) * 100);

  return (
    <div className="overlay open">
      <div className="chatwrap" role="dialog" aria-modal="true" aria-label="リスト作成中">
        <div className="modal-head">
          <h3>
            リストを作成中
            <span className="chat-sub">母集団 → 公式サイト → 本社代表電話 → 出力</span>
          </h3>
          <button className="x" onClick={onCancel} aria-label="閉じる">
            ×
          </button>
        </div>

        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          <div className="dhead" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div className="kick">
              <span className="code">{useCase}</span>
              <span className="tag run">実行中</span>
            </div>
            <h2>{title}</h2>
            <div className="meta">
              <span>
                目標 <b className="num">{target.toLocaleString()} 件</b>
              </span>
              <span>
                進捗 <b className="num">{pct}%</b>
              </span>
            </div>
          </div>

          <div className="sec">
            <div className="sec-h">
              <h3>収穫パイプライン</h3>
              <span className="hint">実行中（展示デモ）</span>
            </div>
            <div className="steps">
              {stages.map((s, i) => {
                const cls = stepCls(s);
                const val =
                  s.status === "done" || s.status === "running"
                    ? s.rate
                      ? s.rate
                      : `${s.count.toLocaleString()}`
                    : "待機";
                const barPct = s.rate
                  ? parseInt(s.rate) || 0
                  : s.status === "done"
                  ? 100
                  : s.status === "running"
                  ? s.total
                    ? Math.round((s.count / s.total) * 100)
                    : 60
                  : 0;
                return (
                  <div className={`step ${cls}`} key={s.stage}>
                    <span className="no">{i + 1}</span>
                    <span className="nm">
                      {STAGE_LABEL[s.stage]}
                      <span className="d">{STAGE_HINT[s.stage]}</span>
                    </span>
                    <span className="bar">
                      <span style={{ width: `${barPct}%` }} />
                    </span>
                    <span className="val num">
                      {s.status === "done" && s.rate ? <b>{s.rate}</b> : val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sec">
            <div className="sec-h">
              <h3>直近のイベント</h3>
              <span className="hint">worker log</span>
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
                      <td colSpan={3}>起動中…</td>
                    </tr>
                  )}
                  {events.map((e, i) => (
                    <tr key={i}>
                      <td className="tel">
                        {new Date(e.ts).toLocaleTimeString("ja-JP")}
                      </td>
                      <td>{e.stage ?? ""}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="chatfoot">
          <button className="btn" onClick={skip}>
            スキップして結果へ →
          </button>
        </div>
      </div>
    </div>
  );
}
