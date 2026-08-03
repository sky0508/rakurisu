# worker を Mac に常駐させる（launchd）

会社の人にも使ってもらうには、**worker（処理本体）が常に動いている**必要がある。
web（Vercel）はジョブを Neon に積むだけで、実際の与件分解・クロールは worker が担う。
worker は現状 **Sora の Mac 1 台**。そのため Mac に launchd で常駐させる。

## 仕組み
- `com.sorasasaki.rakurisu-worker.plist` = LaunchAgent 定義（このディレクトリにコピーを保管）。
- `caffeinate -i` で worker 実行中はアイドルスリープを抑止。
- 秘密は plist に置かず、`worker/.env`（`DATABASE_URL` / `GEMINI_API_KEY` / `BRAVE_API_KEY`）から読む。
- `RunAtLoad`=ログイン時起動 / `KeepAlive`=落ちても自動再起動 / `PYTHONUNBUFFERED=1`=ログ即時 flush。
- ログ: `/tmp/rakurisu-worker.out.log` / `/tmp/rakurisu-worker.err.log`。

## インストール / 起動
```sh
cp worker/com.sorasasaki.rakurisu-worker.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.sorasasaki.rakurisu-worker.plist
launchctl list | grep rakurisu          # 登録確認
tail -f /tmp/rakurisu-worker.out.log    # ライブログ
```

## 停止 / 再起動
```sh
launchctl unload ~/Library/LaunchAgents/com.sorasasaki.rakurisu-worker.plist   # 停止
launchctl unload ... && launchctl load -w ...                                   # 設定変更後の再読込
```

## 注意（トライアル運用の前提）
- **Mac 依存**: この Mac が起きている間だけ全員のジョブが処理される。**ノートはフタを閉じるとスリープ**して止まる（`caffeinate -i` はアイドルスリープのみ抑止）。電源接続＋フタ開き、または「システム設定 > ロック画面/バッテリー」でスリープ無効を推奨。恒久運用は worker をクラウド常時稼働マシンへ（別途）。
- **直列処理**: worker は 1 度に 1 run（`FOR UPDATE SKIP LOCKED`）。複数人のジョブはキューで順番待ち。
- **課金**: AI（Gemini / Brave）は Sora のキー・無料枠を全員分消費する。
- **データ露出**: 現状 `PUBLIC_DEMO=1`（URL を知れば誰でも閲覧）。leads は実在企業の電話リスト。社外に URL を出さない運用にするか、認証恒久方針（spec §11-2）を先に確定すること。
