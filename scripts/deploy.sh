#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${1:-}"

if [[ -z "$PROJECT" || ! -d "$PROJECT" ]]; then
  echo "Usage: ./scripts/deploy.sh <family-bot|band-bot>" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo ".env が見つかりません。先に ./scripts/setup.sh を実行してください。" >&2
  exit 1
fi

set -a
source .env
set +a

VARNAME="$(echo "$PROJECT" | tr '[:lower:]-' '[:upper:]_')_DEPLOYMENT_ID"
DEPLOYMENT_ID="${!VARNAME:-}"

if [[ -z "$DEPLOYMENT_ID" ]]; then
  echo "$VARNAME が .env に設定されていません。@shota-imoto にDMで値を確認して .env に入力してください。" >&2
  exit 1
fi

if ! npx clasp list >/dev/null 2>&1; then
  echo "==> clasp未ログイン、または認証切れです。ログインします"
  npx clasp login
fi

echo "==> テストを実行します"
npm test

echo "==> $PROJECT を push します"
(cd "$PROJECT" && npx clasp push -f)

echo "==> 既存デプロイ ($DEPLOYMENT_ID) を更新します（URLは変わりません）"
(cd "$PROJECT" && npx clasp deploy -i "$DEPLOYMENT_ID" --description "手動デプロイ: $(date +%Y-%m-%d)")

echo "==> デプロイ完了"
