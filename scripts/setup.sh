#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> npm install"
npm install

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> .env を作成しました。DEPLOYMENT_IDの値は @shota-imoto にDMで確認して .env に入力してください。"
else
  echo "==> .env は既に存在するのでスキップします"
fi

echo "==> clasp login (ブラウザが開きます。編集者権限を付与されたGoogleアカウントでログインしてください)"
npx clasp login

echo "==> セットアップ完了。デプロイは ./scripts/deploy.sh <family-bot|band-bot> を実行してください"
