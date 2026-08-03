# ラクリス (rakurisu)

lead-harvest（B2B リード収集）のジョブを **UI から実行・監視・納品確認する webapp**。
既存の lead-harvest Python パイプライン（`.claude/skills/lead-harvest/`）を、Claude セッション内の対話ではなくブラウザから回せるようにする。

**現況: MVP 実装済み・通貫検証済み（2026-07-31）。** → `status.md`

## 構成（モノレポ）

```
rakurisu/
  web/        Next.js 16 + Neon(Drizzle) + iron-session + Google OAuth（:3060）
  worker/     Python。Neon を poll → skill の 4 スクリプトを実行 → 状態を書き戻し（Sora の Mac 常駐）
  docs/       spec.md（要件）/ plan.md（当初計画）/ DESIGN.md（quiet-product）/ mock.html（承認済みデザインモック）
  brand/      アイコン素材（リス × テラコッタ）
  SETUP.md    ローカル起動手順
  DEPLOY.md   本番デプロイ & env（web ローカル / Vercel / worker の 3 箇所）
  status.md   現況・次アクション
```

アーキテクチャ: `[ブラウザ] → [web :3060] → [Neon] ← poll ← [worker]`（web は Vercel 可・worker は Mac 常駐・Neon 共有）。

## 動かす

`SETUP.md` を上から。要点だけ:
```bash
cd web && pnpm install && pnpm dev      # :3060
cd worker && python3 run_worker.py --once   # 別ターミナル・.venv 有効化後
```

## 由来・デザイン

`/rich-webapp-design` スキルの「最低ライン」実物として設計。AIっぽくない業務系 UI（Asana / Craft 系「洗練された普通」= quiet-product）。
命名: リス（収穫＝木の実を集める）× lead-harvest。アイコンは `brand/icon-source.png`（GPT Image 生成、base64 埋め込み）。
