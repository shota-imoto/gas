# gas

家族用・バンド用のGoogle Apps Scriptプロジェクト。

- `family-bot/` — 家族用bot
- `band-bot/` — バンド用bot

## セットアップ（初回のみ）

1. プロジェクトルートで `npm run setup` を実行
2. @shota-imoto から `DEPLOYMENT_ID` をもらって `.env` に設定

以降、「本番環境へのデプロイ手順」が実行できます。

**補足**

- `git clone` してこのディレクトリに移動した状態で実行すること
- `npm run setup`（`scripts/setup.sh`）は以下をまとめて行う
  - `npm install`
  - `.env.example` から `.env` を作成（初回のみ。既にあればスキップ）
  - `clasp login`（ブラウザが開く）
- claspログインには、デプロイ対象のApps Scriptプロジェクトへの**編集者権限**を持つGoogleアカウントが必要。権限がない場合は既存の編集者（@shota-imoto）にApps Scriptエディタの「共有」から追加してもらってから実行すること
- 認証情報は `~/.clasprc.json` に保存される。他人と共有したりGitにコミットしたりしないこと
- このリポジトリは**Public**であり、かつLINE Webhookの署名検証は未実装（実装困難と判断済み）のため、DEPLOYMENT_ID＝Webhook URLの一部は**絶対にコミットしない・READMEやIssue/PRに直接書かない**こと
- **自分のアカウントで初めてデプロイした直後は、Webhookが403エラーになることがある**。このWebアプリは`appsscript.json`で`"executeAs": "USER_DEPLOYING"`（実行するユーザー: デプロイした人）に設定されており、初めてデプロイしたアカウントがこのスクリプトの実行に必要な権限（Spreadsheet/Calendar/外部URLへのリクエストなど）をまだ承認（OAuth consent）していないため。以下の手順で一度だけ承認すれば直る（デプロイする人が変わるたびに、その人のアカウントで一度だけ必要）
  1. スプレッドシートを開き、「拡張機能」→「Apps Script」でエディタを開く
  2. 上部の関数選択ドロップダウンで任意の関数（例: `testExpense`）を選ぶ
  3. 実行ボタン（▶）をクリック
  4. 「承認が必要です」ダイアログが出るので、自分のGoogleアカウントを選択し、「詳細」→「（プロジェクト名）に移動（安全ではないページ）」→「許可」と進めて承認を完了させる

## 本番環境へのデプロイ手順

```
npm run deploy -- family-bot   # または band-bot
```

（`--` の後ろの引数がプロジェクト名。付け忘れるとエラーになる）

内部で以下を実行している（`scripts/deploy.sh`）。テストが失敗した場合はpush/deployされない。

```
npm test
cd family-bot   # または band-bot
npx clasp push -f
npx clasp deploy -i "$DEPLOYMENT_ID" --description "手動デプロイ: $(date +%Y-%m-%d)"
```

### 重要: 必ず `-i <DEPLOYMENT_ID>` を指定すること

LINE Messaging APIのWebhook URLがこのApps ScriptのデプロイURLを直接参照しているため、**デプロイURLを変更してはいけない**。

- `-i <DEPLOYMENT_ID>` を指定して `clasp deploy` を実行すると、既存デプロイのバージョンだけが更新され、URLは変わらない
- `-i` を指定せずに `clasp deploy` を実行すると**新しいデプロイが作られ、URLが変わってしまう**（LINE側のWebhook設定が壊れる）。`npm run deploy` を使えばこの事故は防げるので、必ずこちら経由でデプロイすること

## デプロイ前の動作確認

- 本番環境をそのまま動作確認に使っているため、デプロイ前にLINEで関係者へ一言連絡すること
- デプロイを実行できる人に制限はない。連絡済みであれば、コラボレーター権限を持つ人が誰でも実行してよい

## テスト

```
npm test
```
