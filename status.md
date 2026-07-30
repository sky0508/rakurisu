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

### P1 実行監視 MVP（未着手・ブロック中）
- [ ] **spec §7 の実行アーキテクチャ確定（A ローカル常駐 / B DB集約）** ← 最優先ブロッカー
- [ ] 確定後 `docs/plan.md` 作成
- [ ] ジョブ一覧・状態・stage 進捗を実データ表示（F4/F5/F7）
- [ ] 案件ディレクトリ（`リスト作成/<案件>/`）との紐付け

### P2 起票・実行トリガー（未着手）
- [ ] 画面から新規ジョブ作成 → 試走 → GO → 本番キック（F1/F3）

### P3 検証・分解の取り込み（未着手）
- [ ] 与件分解 3 案の実キック（F2）
- [ ] Stage 5 検証評価（F6）

## ブロッカー

| # | 内容 | 解消の道 |
|---|---|---|
| B1 | GitHub 認証（device code 期限切れ ×2） | `gh auth login --with-token`（PAT）or Vercel CLI 先行デプロイ |
| B2 | 実行アーキテクチャ未決（spec §7） | Sora が A/B を判断 → P1 の plan へ |

## 次アクション（直近）

1. 共有 URL を出す: **token で gh 認証 → repo → push → Vercel**、または **Vercel CLI 先行デプロイ**（vercel は認証済み）
2. spec.md をレビュー → §7 アーキテクチャと §10 未決事項を決める
3. 決まったら P1 の `plan.md` を作成

## セッションログ

- **2026-07-30**: `/rich-webapp-design` で quiet 版モック制作 → Sora が「最低ライン」承認。ラクリス命名 + アイコン生成
- **2026-07-31**: プロジェクト化（独立 git・ローカルコミット）。gh 認証 2 回失敗（device code 期限切れ）。バックエンド（lead-harvest スクリプト群）を確認し要件定義書・本ステータスを整備
