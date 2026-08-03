"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, postJson } from "@/lib/fetcher";
import type { RecipeSummary } from "@/lib/api-types";

const USE_CASES = ["架電営業", "DM・郵送", "フォーム営業", "メール営業", "提携先発掘"];
const COMPLIANCE = ["制約なしで進める", "競合除外あり", "個人情報を扱わない"];

export function NewJobModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}) {
  const { data } = useSWR<{ recipes: RecipeSummary[] }>(
    open ? "/api/recipes" : null,
    fetcher
  );
  const recipes = data?.recipes ?? [];

  const [brief, setBrief] = useState("");
  const [useCase, setUseCase] = useState(USE_CASES[0]);
  const [target, setTarget] = useState("80");
  const [compliance, setCompliance] = useState(COMPLIANCE[0]);
  const [recipeId, setRecipeId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function create() {
    setSaving(true);
    setErr(null);
    try {
      const title =
        recipes.find((r) => r.id === recipeId)?.label ||
        brief.slice(0, 40) ||
        "無題ジョブ";
      const res = await postJson<{ job: { id: string } }>("/api/jobs", {
        title,
        useCase,
        target: Number(target) || 0,
        compliance,
        brief: brief || undefined,
        recipeId: recipeId || null,
      });
      onCreated(res.job.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="新規ジョブ">
        <div className="modal-head">
          <h3>新規ジョブ</h3>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="fgrid">
            <div className="field full">
              <label>ターゲット / 与件</label>
              <textarea
                placeholder="業種・条件、または「誰に売るか未定」"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>
            <div className="field full">
              <label>レシピ（構造化ソース・A/B パターン）</label>
              <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">未選択（与件分解へ / Phase 3）</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label ?? r.source}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>用途</label>
              <select value={useCase} onChange={(e) => setUseCase(e.target.value)}>
                {USE_CASES.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>目標件数（納品）</label>
              <input
                value={target}
                inputMode="numeric"
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="field full">
              <label>コンプラ制約</label>
              <select value={compliance} onChange={(e) => setCompliance(e.target.value)}>
                {COMPLIANCE.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            {useCase === "架電営業" && (
              <div className="proposal">
                <div className="t">自動提案 — 用途「架電営業」より</div>
                <div className="cols">
                  <span className="ct req">会社名（必須）</span>
                  <span className="ct req">本社代表電話（必須）</span>
                  <span className="ct">Tier</span>
                  <span className="ct">都道府県</span>
                  <span className="ct">業種</span>
                  <span className="ct">電話判定</span>
                </div>
                <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--ink2)" }}>
                  品質バー: 本社代表電話 <b>85%</b> を仮の合格ラインに設定 →
                  試走で最終確定します。
                </p>
              </div>
            )}
            {err && (
              <div className="field full">
                <div className="note flag">{err}</div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={create} disabled={saving}>
            {saving ? "作成中…" : recipeId ? "作成して準備" : "作成"}
          </button>
        </div>
      </div>
    </div>
  );
}
