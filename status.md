---
project: rakurisu
status: active
updated: 2026-07-30
---

# ラクリス status

## 現況（2026-07-30）

- `/rich-webapp-design` スキルで quiet-product パターンのモックを制作（= スキルの最低ライン実物）
- プロジェクト化: `02_projects/rakurisu/`（独立 git repo、work-os は nested で非track）
- 命名「ラクリス」+ 実アイコン（GPT Image）確定
- 社内共有を独立 repo → Vercel 経由で行う方針（Sora 2026-07-30）

## チェックリスト

- [x] モック制作（index.html, 4 state）
- [x] プロジェクト構造 + docs（spec / DESIGN.md / README）
- [x] ローカル git init + 初回コミット
- [ ] GitHub repo 作成（sky0508/rakurisu）※ `gh auth login` は Sora 操作
- [ ] push
- [ ] Vercel デプロイ → 社内共有 URL
- [ ] 社内共有（Slack 等に URL 投下）

## 次フェーズ（合意後）

- [ ] モックへのフィードバック反映
- [ ] Next.js 化（spec → plan → 実装）。DESIGN.md を tokens に落とす
- [ ] 実データ連携（lead-harvest の実行状況 / Sheets）

## メモ

- モックはサンプルデータのみ（実在しない社名・実機密なし）→ 社内共有に問題なし
- Vercel は静的配信（index.html がルート、framework=Other、build なし）
