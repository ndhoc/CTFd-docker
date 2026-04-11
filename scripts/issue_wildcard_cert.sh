#!/usr/bin/env bash
set -euo pipefail

DOMAIN_ROOT="${DOMAIN_ROOT:-jil.io.vn}"
CTFD_DIR="${CTFD_DIR:-/opt/CTFd}"
CF_INI="/root/.secrets/certbot/cloudflare.ini"

if [[ -z "${CF_DNS_API_TOKEN:-}" ]]; then
  echo "Missing CF_DNS_API_TOKEN environment variable"
  echo "Example: CF_DNS_API_TOKEN=xxxx /opt/CTFd/scripts/issue_wildcard_cert.sh"
  exit 1
fi

mkdir -p /root/.secrets/certbot
cat > "$CF_INI" <<EOF
dns_cloudflare_api_token = ${CF_DNS_API_TOKEN}
EOF
chmod 600 "$CF_INI"

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "$CF_INI" \
  --agree-tos \
  --register-unsafely-without-email \
  --non-interactive \
  -d "$DOMAIN_ROOT" \
  -d "*.$DOMAIN_ROOT"

cd "$CTFD_DIR"
docker compose up -d nginx
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "Certificate issued and nginx reloaded"
