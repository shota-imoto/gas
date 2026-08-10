# gas

家族用・バンド用のGoogle Apps Scriptプロジェクト。

- `family-bot/` — 家族用bot
- `band-bot/` — バンド用bot

## セットアップ（初回のみ）

1. このリポジトリを取得する
   ```
   git clone <このリポジトリのURL>
   cd gas
   npm install
   ```
2. デプロイ対象のApps Scriptプロジェクトへの**編集者権限**を持っていることを確認する
   - 持っていない場合は、既存の編集者（@shota-imoto）にApps Scriptエディタの「共有」から自分のGoogleアカウントを編集者として追加してもらう
3. 自分のGoogleアカウントでclaspにログインする
   ```
   npx clasp login
   ```
   - ブラウザが開くので、手順2で編集者権限を付与したGoogleアカウントでログインする
   - 認証情報は `~/.clasprc.json` に保存される。他人と共有したりGitにコミットしたりしないこと

## 本番環境へのデプロイ手順

対象プロジェクトのディレクトリ（`family-bot` または `band-bot`）に移動して実行する。

```
cd family-bot   # または band-bot
npx clasp push -f
npx clasp deploy -i <DEPLOYMENT_ID> --description "手動デプロイ: $(date +%Y-%m-%d)"
```

### 重要: 必ず `-i <DEPLOYMENT_ID>` を指定すること

LINE Messaging APIのWebhook URLがこのApps ScriptのデプロイURLを直接参照しているため、**デプロイURLを変更してはいけない**。

- `-i <DEPLOYMENT_ID>` を指定して `clasp deploy` を実行すると、既存デプロイのバージョンだけが更新され、URLは変わらない
- `-i` を指定せずに `clasp deploy` を実行すると**新しいデプロイが作られ、URLが変わってしまう**（LINE側のWebhook設定が壊れる）。絶対に実行しないこと

### DEPLOYMENT_IDの確認方法

各プロジェクトディレクトリで以下を実行し、本番で使われているデプロイ（Web Appとして公開されているもの）のIDを確認する。

```
npx clasp deployments
```

一覧の中から、Apps Scriptエディタの「デプロイを管理」で表示されている本番URLに対応するデプロイIDを使うこと。迷ったら実行前に @shota-imoto に確認する。

## デプロイ前の動作確認

- 本番環境をそのまま動作確認に使っているため、デプロイ前にLINEで関係者へ一言連絡すること
- デプロイを実行できる人に制限はない。連絡済みであれば、コラボレーター権限を持つ人が誰でも実行してよい

## テスト

```
npm test
```
