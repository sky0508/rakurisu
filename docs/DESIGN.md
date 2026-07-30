# DESIGN.md — ラクリス

このファイルは本プロジェクトのデザイン言語の正。UI を書く前に毎回読むこと。
選択 pack: **quiet-product**（Asana / Craft 系「洗練された普通」。他 pack の要素を混ぜない）
参照点: Asana タスクリスト / Craft ホーム（Web平均ではない基準線）
出典スキル: `/rich-webapp-design` — `references/pattern-quiet-product.md` と `exemplar-quiet-rakurisu.html`（＝この `index.html`）が正。

## 1. 禁止リスト（世界共通 AI tells — 編集禁止）

統計的平均（"on distribution"）に収束しないよう、以下を禁止する:

- 紫〜藍のグラデーション、Tailwind indigo 既定色
- Inter / Roboto / system-ui を「選ばずに」使うこと、Space Grotesk（＝第2の Inter）
- Hero + 角丸3カード横並び / 完全中央揃え / MacBook モック
- 角丸カード + ソフトシャドウの多重ネスト（card in card in card）
- pill バッジの乱用、絵文字の UI クローム利用、左端 3–4px の着色ボーダー
- 要求されていないダークモード、純黒 #0A0A0A の寒色ダーク、GitHub Primer 直置き
- **ドラマの盛り**: 不要な特大数字(50px+)・カウントアップ・点滅ドット・uppercase mono ラベル
- **枠（クローム）への着色**: アクセント色を active 表示・ボーダー・進捗バー・パネルに散布すること
- イニシャル2文字入り角丸四角ロゴ（AI のロゴプレースホルダの典型）

## 2. Typography

- 本文/UI: `"Noto Sans JP", system-ui, -apple-system, sans-serif`。font-family は和文→欧文→generic 順
- ディスプレイフォントは使わない（quiet-product）
- 数値・ID・電話番号: `ui-monospace, "SF Mono", Menlo, monospace` + `tabular-nums`。mono は実データの小表示だけ
- **サイズのメリハリ**（均一な小ささ NG・特大ドラマ NG の中間）:
  - 本文 12〜13 / セクション見出し 14.5 / 記事(ジョブ)タイトル 22 / ページタイトル 23 / 主要データ値 27px
- ウェイト: 400 / 500 / 700 の範囲。装飾 uppercase letter-spacing はしない

## 3. Color

```
--side:#1E1F21;   /* 暖チャコール = 脇役の面（サイドバー） */
--bg:#F7F6F4; --sheet:#FFFFFF;   /* 紙白 = 主役の面（7割以上） */
--ink:#1F1E1B; --ink2:#6E6C66; --ink3:#9C9A94;
--line:#ECEAE6; --line2:#DEDBD5;   /* 暖色ヘアライン */
--accent:#C4532F;   /* テラコッタ = primary CTA のみ。主題(収穫/リス)から導出 */
```

**色はデータにだけ住む**。ステータス/優先度/タグはトーナルペア（薄い同色相背景 + 濃い同色相文字）:

```
--ok:  bg #E5F2E9 / tx #256C43   (完了/good)
--run: bg #E3EDF7 / tx #2A5E96   (実行中)
--wait:bg #FBF0D7 / tx #8A6A1C   (GO待ち/要確認)
--mut: bg #EFEDEA / tx #6E6C66   (分解/中立)
```

生の彩度（Tailwind 500番台）を直置きしない。

## 4. Surface & Border

- 境界は **1px の暖色ヘアライン**（`--line`）と余白で作る。shadow は modal / popover にだけ
- border-radius: **8px**（タグ・小要素は 6px）で統一。pill 禁止
- 白い主役の面の上に、罫線と余白で区画（パネルの箱を並べない）

## 5. Layout

- サイドバー 248px + メイン。メイン内は キュー 300px + 詳細
- 8px リズム。行高 44〜48px
- 均等 3 カラムカード・意味のない中央揃えは禁止

## 6. Motion

- 基本なし。カウントアップ・点滅・staggered reveal は使わない（＝ドラマ tell）
- hover / focus の 100ms transition のみ

## 7. 日本語組版

- 本文 line-height 1.75 / 見出し 1.3–1.5 / 表・フォーム 1.4
- letter-spacing: 本文 0（タイトルのみ -.01em 程度の締め可）
- 折返し: `overflow-wrap: anywhere` + `word-break: normal`（break-all は禁則を壊すので禁止）
- 英数字は欧文フォント側で（font-family 指定順で自然に実現）

## 8. States

- 各ジョブの done / running / dryrun / decompose を状態別に設計。hover だけ反応する見せかけを作らない
- ダミーは実在感（実案件の桁感・実在しない社名・現実的日付）。footer にモック注記

## 9. ブランド

- 実名「ラクリス」+ 実アイコン（`brand/icon-source.png`、96px 縮小を base64 で埋め込み）
- リス × 収穫のモチーフ、テラコッタ地の白抜きシルエット

## 10. 実装トークン（Next.js 化する時）

- 上記 §2–4 を CSS variables（:root）→ Tailwind config に落とす。コンポーネント内に hex 直書きしない
- 現モックの CSS がそのまま tokens の出典
