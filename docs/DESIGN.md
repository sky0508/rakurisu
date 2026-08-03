# DESIGN.md — ラクリス（lead-harvest console）

このファイルは本プロジェクトのデザイン言語の正。UI を書く前に毎回読むこと。
選択 pack: **quiet-product**（Asana / Craft 系「洗練された普通」）。他 pack の要素を混ぜない。
参照点: `.claude/skills/rich-webapp-design/references/pattern-quiet-product.md` と
実物 `references/exemplar-quiet-rakurisu.html`（＝ Sora 承認の品質フロア）。
実装のトークンは `web/src/app/globals.css` の `:root` が正（本書と一致させる）。

## 1. 禁止リスト（世界共通 AI tells — 編集禁止）

- 紫〜藍のグラデーション、Tailwind indigo 既定色をそのまま使うこと
- Inter / Roboto / Open Sans / system-ui を「選ばずに」使うこと
- Hero + 角丸3カード横並び / 完全中央揃えヒーロー / MacBook モック
- 角丸カード + ソフトシャドウの多重ネスト（card in card in card）
- pill バッジ、絵文字の装飾・アイコン代用、左端 3–4px の着色ボーダー
- 要求されていないダークモード、glassmorphism の無思考な使用
- 均等に分散した臆病なパレット（ドミナント無し）
- 400 vs 600 のような中途半端なウェイト差 → ここでは 400 / 700 の 2 段
- マイクロインタラクションを散らすこと（モーションは §6 のみ）

## 2. quiet-product の核心（部品でなく規律で作者性を出す）

Asana も Craft も pill・角丸・絵文字・グラデを使う。それでも AI っぽくない。
AI っぽさの正体は部品ではなく次の 4 つ。これを避ける:

1. **枠（クローム）への着色** — アクセント色を active 状態・ボーダー・パネルに散布しない
2. **ドラマの盛り** — 特大支配数字・カウントアップ・点滅ドット・uppercase mono ラベル・ダークテーマは使わない
3. **生の彩度・純黒** — Tailwind 500 番台や #0A0A0A の寒色ダークを直置きしない
4. **面の主従の欠如** — 白い主役面を作り、同格パネルを並べない

## 3. Typography

- 静かなサンス 1 種: **Noto Sans JP**（+ system-ui フォールバック）。ディスプレイフォント不要
- mono は実データ（電話番号・ID・URL・時刻）の小表示にだけ（`ui-monospace`）。uppercase ラベル装飾はしない
- ウェイトは **400 / 700** の 2 段
- サイズにメリハリ（均一な小ささも特大 50px+ もダメ、中間）:
  本文 12–13 / セクション見出し 14.5 / 記事・ページタイトル 22–23 / 主要データ値 27px
- 数値は `font-variant-numeric: tabular-nums`

## 4. Color（色はデータにだけ住む）

- クローム（ナビ・ボタン枠・見出し・ボーダー）は無彩色 + ブランド色 **1 点**（primary CTA のみ）
- 地色: サイドバー（脇役）暖チャコール `#1E1F21` / 主役面 `#FFFFFF` / アプリ地 `#F7F6F4`
- インク: `#1F1E1B` / `#6E6C66` / `#9C9A94`。罫線 `#ECEAE6` / `#DEDBD5`（暖色寄りヘアライン）
- **アクセント（CTA だけ）**: テラコッタ `#C4532F`（hover `#B04A29`）
- 意味色は**トーナルペア**（薄い背景 + 濃い同色相文字。生の彩度を直置きしない）:
  - ok `#E5F2E9` / `#256C43`、run `#E3EDF7` / `#2A5E96`、wait `#FBF0D7` / `#8A6A1C`、mut `#EFEDEA` / `#6E6C66`

## 5. Surface & Border

- 影はほぼ使わない（modal / popover にだけ 1 種）。面は罫線 + 地色の明度差で分ける
- border-radius は **1 値系**（6–8px。ボタン 8 / タグ 6）。pill 禁止
- 行高 44–48px 目安、余白は 4/8px リズム

## 6. Motion

- **基本なし**。カウントアップ・点滅・staggered reveal は全部ドラマ＝AI tell → 使わない
- hover / focus の 100ms 前後の transition のみ
- 進捗は SWR ポーリングで自然更新（アニメで演出しない）

## 7. 日本語組版

- 本文 line-height 1.75 / 見出し 1.35–1.5 / 表・フォーム 1.5
- letter-spacing: 本文 0
- 折返し: `overflow-wrap: anywhere` + `word-break: normal`（break-all 禁止）
- font-family は 和文→system-ui の順。英数字・電話・時刻は mono

## 8. States

- empty（ジョブ0件）: 短い文 + 次の 1 アクション「＋新規ジョブ で最初の案件を作成」。イラスト無し
- loading: 「読み込み中…」の静かな 1 行
- running: current ステージ・進捗・母集団を stat 行で、パイプラインは罫線表、ニュートラル進捗バー
- done: 納品/電話率/公式サイト率/要確認の stat 行 + Tier note + プレビュー表
- error: `.note.flag` に理由 + 再実行ボタン
- ボタン・入力の hover/focus/disabled を必ず設計

## 9. ブランド

- 実名「ラクリス」+ 実アイコン（リス × テラコッタ、base64 埋め込み `src/lib/brand.ts`）
- イニシャル 2 文字入り角丸四角の AI プレースホルダは使わない

## 10. 実装トークン

- CSS 変数（`globals.css` :root）に §3–5 を集約。コンポーネントに hex 直書きしない
- Tailwind v4 導入済みだが、承認済みモックの CSS をそのまま globals.css に移植しクラスで当てている
  （道具系の密度は utility より手書き CSS の方が忠実。新規部品は既存クラス規約に合わせる）
