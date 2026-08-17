"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/fetcher";
import type { ChatMessage, ChatReply } from "@/lib/api-types";

/**
 * 要件カードに出す分解チェーン（本スライスは枠のみ・抽出は次スライス）。
 * playbook.md の思考プロセス（便益→業界/セグメント→規模→部署）に対応。シグナル/ソースは AI 自動導出。
 */
const CHAIN = [
  { k: "product", label: "売りたいもの" },
  { k: "benefit", label: "独自便益" },
  { k: "segment", label: "ニーズのある業界・セグメント" },
  { k: "reach", label: "規模・到達" },
  { k: "dept", label: "部署・バイネーム（到達用）" },
  { k: "signal", label: "シグナル/ソース（AI導出）" },
];

const OPENING =
  "リスト作成の要件を一緒に固めましょう。まずは「何を売りたいか」だけ、ざっくり教えてください。そこから「それが刺さりそうな相手」はこちらから提案していきます。";

/**
 * 与件を対話で固める画面（幅広テイクオーバー）。
 * 本スライス = 対話の器 + /api/chat 1 往復。ジョブ生成・要件抽出は次スライス。
 */
export function ChatCompose({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  // 次スライスで N 仮説 → ジョブ生成の合流に使う（本スライスでは未使用）
  onCreated?: (jobId: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  if (!open) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setErr(null);
    const history = messages;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await postJson<ChatReply>("/api/chat", { message: text, history });
      setMessages((m) => [...m, { role: "model", text: res.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="chatwrap" role="dialog" aria-modal="true" aria-label="与件を対話で固める">
        <div className="modal-head">
          <h3>
            与件を対話で固める
            <span className="chat-sub">ふわっとした要件 → 観測可能なシグナル</span>
          </h3>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="chatbody">
          <div className="chatmain">
            <div className="msgs" ref={listRef}>
              <div className="msg model">
                <div className="bubble">{OPENING}</div>
              </div>
              {messages.map((m, i) => (
                <div className={`msg ${m.role}`} key={i}>
                  <div className="bubble">{m.text}</div>
                </div>
              ))}
              {sending && (
                <div className="msg model">
                  <div className="bubble typing">考え中…</div>
                </div>
              )}
            </div>
            {err && (
              <div className="note flag" style={{ margin: "0 16px 4px" }}>
                {err}
              </div>
            )}
            <div className="composer">
              <textarea
                placeholder="例）リフォーム会社に何か営業したい / 既存の顧客は EC 事業者が多い"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
              />
              <button
                className="btn btn-primary"
                onClick={() => void send()}
                disabled={sending || !input.trim()}
              >
                {sending ? "送信中…" : "送信"}
              </button>
            </div>
          </div>

          <aside className="reqcard">
            <div className="rc-h">要件（対話から抽出）</div>
            {CHAIN.map((c) => (
              <div className="rc-row" key={c.k}>
                <span className="rc-k">{c.label}</span>
                <span className="rc-v muted">会話から抽出予定</span>
              </div>
            ))}
            <div className="rc-note">※ このスライスは枠のみ。抽出のライブ更新は次で実装。</div>
          </aside>
        </div>

        <div className="chatfoot">
          <button className="btn" onClick={onClose}>
            閉じる
          </button>
          <button className="btn btn-primary" disabled title="次スライスで有効化">
            この要件で仮説を出す →
          </button>
        </div>
      </div>
    </div>
  );
}
