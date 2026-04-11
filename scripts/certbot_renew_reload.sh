#!/usr/bin/env bash
set -euo pipefail

cd /opt/CTFd

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot is not installed"
  exit 1
fi

certbot renew --quiet --deploy-hook "docker compose exec -T nginx nginx -s reload"
