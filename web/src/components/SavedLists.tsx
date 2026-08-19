"use client";

import { useMemo, useState } from "react";
import { DEMO_LISTS, maskPhone, type DemoList } from "@/data/demo-lists";

/**
 * 左タブ「作成したリスト」= 展示用の格納ビュー。
 * 静的JS（実データ由来）＋セッションで「作成した」リストを一覧・全行プレビュー・Excel DL。
 * DB/worker には触らない（ブースでオフラインでも動く）。
 */
export function SavedLists({
  lists,
  newIds = [],
  initialSelectedId,
}: {
  lists?: DemoList[];
  newIds?: string[];
  initialSelectedId?: string | null;
}) {
  const all = lists ?? DEMO_LISTS;
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? all[0]?.id ?? null
  );
  const selected = useMemo(
    () => all.find((l) => l.id === selectedId) ?? all[0] ?? null,
    [all, selectedId]
  );

  async function downloadExcel(list: DemoList) {
    // クライアント側で .xlsx を生成（SSR に載せないよう動的 import）
    const XLSX = await import("xlsx");
    const isPhone = new Set(list.phoneColumns);
    const aoa: (string | number)[][] = [
      list.columns,
      ...list.rows.map((r) =>
        list.columns.map((c) => (isPhone.has(c) ? maskPhone(r[c] ?? "") : r[c] ?? ""))
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "リスト");
    const safe = list.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    XLSX.writeFile(wb, `${safe}.xlsx`);
  }

  return (
    <>
      <div className="topbar">
        <h1>作成したリスト</h1>
        <span className="sub num">{all.length} 本 格納中</span>
        <span className="spacer" />
      </div>

      <div className="body2">
        <aside className="queue">
          <div className="qhead">
            <span className="t">リスト</span>
            <span className="n num">{all.length} 本</span>
          </div>
          {all.length === 0 && (
            <div className="empty">
              <div className="k">まだリストはありません</div>
              対話から作成するとここに格納されます
            </div>
          )}
          {all.map((l) => (
            <button
              key={l.id}
              className={`job ${l.id === selected?.id ? "active" : ""}`}
              aria-pressed={l.id === selected?.id}
              onClick={() => setSelectedId(l.id)}
            >
              <div className="r1">
                <span className="code">{l.useCase}</span>
                {newIds.includes(l.id) ? (
                  <span className="tag run">今作成</span>
                ) : (
                  <span className="tag done">納品済</span>
                )}
              </div>
              <div className="title">{l.title}</div>
              <div className="r2">
                <span>
                  {new Date(l.createdAt).toLocaleDateString("ja-JP")} · 目標{" "}
                  {l.target.toLocaleString()}
                </span>
                <span className="num">{l.rows.length} 社</span>
              </div>
            </button>
          ))}
        </aside>

        <section className="detail">
          {!selected ? (
            <div className="loading">リストを選択してください</div>
          ) : (
            <>
              <div className="dhead">
                <div className="kick">
                  <span className="code">{selected.useCase}</span>
                  {newIds.includes(selected.id) ? (
                    <span className="tag run">今作成</span>
                  ) : (
                    <span className="tag done">納品済</span>
                  )}
                </div>
                <h2>{selected.title}</h2>
                <div className="meta">
                  <span>
                    格納{" "}
                    <b>{new Date(selected.createdAt).toLocaleString("ja-JP")}</b>
                  </span>
                  <span>
                    母集団 <b className="num">{selected.population.toLocaleString()} 社</b>
                  </span>
                  <span>
                    納品 <b className="num">{selected.rows.length.toLocaleString()} 社</b>
                  </span>
                </div>
              </div>

              <div className="sec">
                <div className="sec-h">
                  <h3>プレビュー</h3>
                  <span className="hint">全 {selected.rows.length} 社 · 全列</span>
                </div>
                <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => void downloadExcel(selected)}
                  >
                    Excel ダウンロード（.xlsx）
                  </button>
                </div>
                <div className="tblwrap">
                  <table className="listtbl">
                    <thead>
                      <tr>
                        <th className="rownum">#</th>
                        {selected.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="rownum num">{i + 1}</td>
                          {selected.columns.map((c) => {
                            const isPhone = selected.phoneColumns.includes(c);
                            const v = isPhone ? maskPhone(r[c] ?? "") : r[c] ?? "";
                            return (
                              <td key={c} className={isPhone ? "tel" : undefined}>
                                {v || "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="footnote">
        ラクリス（lead-harvest console）／ 展示デモ: 格納リストは過去の実納品物（列選択・一部抜粋）。
      </div>
    </>
  );
}
