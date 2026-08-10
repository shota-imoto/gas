# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発ルール

- GASのスクリプトプロパティを変更する場合は、@shota-imoto に依頼すること（自分で変更しない）
- 動作確認をしたい場合は、LINEで連絡した上で、featureブランチを本番環境にデプロイすること
  - 本番環境を動作確認に利用する理由: QA環境をわざわざ用意するのはコストに見合わないため
  - デプロイを実行できる人に制限はない。LINEで事前連絡済みであれば、コラボレーター権限を持つ人が誰でも実行してよい（@shota-imotoである必要はない）
- 本番環境へのデプロイはGitHub Actions（`.github/workflows/deploy.yml`の`workflow_dispatch`）を利用すること
