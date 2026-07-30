---
project: rakurisu
status: active
phase: P0（モック合意・社内共有）
updated: 2026-07-31
---

# ラクリス ステータス管理

lead-harvest パイプラインを実行・監視する webapp。要件は `docs/spec.md`、デザインは `docs/DESIGN.md` が正。
このファイルは**セッションごとに追記**し、フェーズと次アクションを管理する。

## 現在地

**P0（モック合意・社内共有）** — モックは完成、社内共有 URL の発行が残。実行アーキテクチャ（spec §7）が P1 のブロッカー。

## フェーズ別チェックリスト

### P0 モック合意・社内共有
- [x] モック制作（`index.html`、done/running/dryrun/decompose 4 state）
- [x] プロジェクト化（`02_projects/rakurisu/`、独立 git repo・work-os は nested 非track）
- [x] ローカル git init + 初回コミット（91a3cf7）
- [x] 命名「ラクリス」+ 実アイコン（`brand/icon-source.png`）
- [x] 要件定義書（`docs/spec.md`）・DESIGN.md・README
- [ ] **GitHub repo 作成（sky0508/rakurisu）** ← `gh auth` が device code 期限切れで 2 回失敗。次は token 方式 or Vercel 先行
- [ ] push
- [ ] Vercel デプロイ → 社内共有 URL
- [ ] 社内共有（Slack 等に URL）
- [ ] モックへのフィードバック回収

### P1 実行監視 MVP（閲覧・plan 済み）
- [x] **実行アーキテクチャ確定 → 案 B（DB集約, Neon）**（2026-07-31）
- [x] `docs/plan.md` 作成（Next.js16+Neon+Drizzle+iron-session、報告シム設計）
- [ ] Next.js scaffold + DESIGN トークン移植（モックは docs/mock.html へ退避）
- [ ] Drizzle スキーマ（jobs/job_stages/deliverables/job_metrics）
- [ ] iron-session パスワードゲート
- [ ] 一覧+詳細（4 state）を Neon 読み取りで実装
- [ ] `runner/lh_sync.py`（案件 data dir → Neon 同期）で実案件1本を表示
- [ ] Vercel 再デプロイ（Next.js 化）→ 社内共有

### P2 起票・実行トリガー（未着手）
- [ ] 画面から新規ジョブ作成 → 試走 → GO → 本番キック（F1/F3）

### P3 検証・分解の取り込み（未着手）
- [ ] 与件分解 3 案の実キック（F2）
- [ ] Stage 5 検証評価（F6）

## ブロッカー

| # | 内容 | 解消の道 |
|---|---|---|
| B1 | GitHub 認証（device code 期限切れ ×2） | `gh auth login --with-token`（PAT）or Vercel CLI 先行デプロイ |
| B2 | ~~実行アーキテクチャ未決~~ | ✅ 解消: 案 B 確定（2026-07-31） |
| B3 | Neon プロジェクト + env 未セット | Sora が Neon 作成（marchon/個人 要判断）→ DATABASE_URL |

## 次アクション（直近）

1. **plan.md をレビュー** → §7 残る決定（queued/failed・Neon の marchon/個人・認証・data dir 参照）を潰す
2. 共有 URL を出す: token で gh 認証 or **Vercel CLI 先行デプロイ**（vercel 認証済み）。※ P1 で Next.js 化するので、モックの静的共有は「今すぐ見せたい」時のみ
3. 決定が揃ったら P1 実装着手（Neon 作成は Sora、それ以外は連続実行）

## セッションログ

- **2026-07-30**: `/rich-webapp-design` で quiet 版モック制作 → Sora が「最低ライン」承認。ラクリス命名 + アイコン生成
- **2026-07-31**: プロジェクト化（独立 git・ローカルコミット）。gh 認証 2 回失敗（device code 期限切れ）。バックエンド（lead-harvest スクリプト群）を確認し要件定義書・本ステータスを整備
