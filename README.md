# ラクリス (rakurisu)

lead-harvest のジョブを実行・監視する webapp。**現状は単一 HTML のデザインモック**（実装前・社内合意用）。

- モック本体: `index.html`（ブラウザで直接開く / Vercel で静的配信）
- デザイン言語: `docs/DESIGN.md`（quiet-product パターン）
- 仕様: `docs/spec.md`
- 進捗: `status.md`

## 由来

`/rich-webapp-design` スキルの「最低ライン」実物。AIっぽくない業務系 UI（Asana / Craft 系の「洗練された普通」）の基準として作成。
命名: リス（収穫＝木の実を集める）× lead-harvest。アイコンは `brand/icon-source.png`（GPT Image 生成、モックには 96px 縮小を base64 で埋め込み）。

## 見る

```bash
open index.html
```

## 今後

モック合意後、通常の spec → plan → 実装フローで Next.js 化する（このリポジトリを webapp 本体に昇格）。
