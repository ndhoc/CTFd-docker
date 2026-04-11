#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/ndhoc/CTFd-docker.git"
INSTALL_DIR="/opt/CTFd"
BRANCH="3.7.4"

ROOT_DOMAIN=""
CTF_SUBDOMAIN="ctf"
DIRECT_SUBDOMAIN="direct"
DYNAMIC_SUBDOMAIN="dynamic"

FRP_TOKEN=""
ISSUE_SSL="0"
SETUP_RENEW_CRON="1"
CF_DNS_API_TOKEN="${CF_DNS_API_TOKEN:-}"

usage() {
  cat <<'EOF'
Usage:
  sudo bash scripts/bootstrap_vps.sh --domain-root example.com [options]

Required:
  --domain-root <domain>          Root domain, e.g. example.com

Optional:
  --repo-url <url>                Git repository URL
  --install-dir <path>            Install path (default: /opt/CTFd)
  --branch <name>                 Git branch/tag to checkout (default: 3.7.4)
  --ctf-subdomain <name>          Subdomain for CTFd (default: ctf)
  --direct-subdomain <name>       Subdomain for direct FRP (default: direct)
  --dynamic-subdomain <name>      Subdomain for dynamic wildcard (default: dynamic)
  --frp-token <token>             FRP token (default: auto-generate UUID)
  --issue-ssl                     Issue wildcard SSL via Cloudflare DNS
  --cf-token <token>              Cloudflare DNS API token (required when --issue-ssl)
  --no-renew-cron                 Skip certbot renewal cron setup
  -h, --help                      Show this help

Example:
  sudo bash scripts/bootstrap_vps.sh \
    --domain-root jil.io.vn \
    --frp-token 03f2c6bb-8a14-4103-9dd8-d1fb14428954 \
    --issue-ssl \
    --cf-token <cloudflare_dns_api_token>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain-root)
      ROOT_DOMAIN="$2"
      shift 2
      ;;
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --ctf-subdomain)
      CTF_SUBDOMAIN="$2"
      shift 2
      ;;
    --direct-subdomain)
      DIRECT_SUBDOMAIN="$2"
      shift 2
      ;;
    --dynamic-subdomain)
      DYNAMIC_SUBDOMAIN="$2"
      shift 2
      ;;
    --frp-token)
      FRP_TOKEN="$2"
      shift 2
      ;;
    --issue-ssl)
      ISSUE_SSL="1"
      shift
      ;;
    --cf-token)
      CF_DNS_API_TOKEN="$2"
      shift 2
      ;;
    --no-renew-cron)
      SETUP_RENEW_CRON="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root (use sudo)."
  exit 1
fi

if [[ -z "$ROOT_DOMAIN" ]]; then
  echo "--domain-root is required"
  usage
  exit 1
fi

if [[ -z "$FRP_TOKEN" ]]; then
  if command -v uuidgen >/dev/null 2>&1; then
    FRP_TOKEN="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  else
    FRP_TOKEN="$(cat /proc/sys/kernel/random/uuid)"
  fi
fi

CTF_DOMAIN="${CTF_SUBDOMAIN}.${ROOT_DOMAIN}"
DIRECT_DOMAIN="${DIRECT_SUBDOMAIN}.${ROOT_DOMAIN}"
DYNAMIC_DOMAIN="${DYNAMIC_SUBDOMAIN}.${ROOT_DOMAIN}"
WILDCARD_DYNAMIC="*.${DYNAMIC_DOMAIN}"

echo "[1/8] Installing base dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  git \
  curl \
  ca-certificates \
  gnupg \
  lsb-release \
  jq \
  ufw \
  certbot \
  python3-certbot-dns-cloudflare

echo "[2/8] Installing Docker and Docker Compose"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-plugin || true
fi

echo "[3/8] Preparing source code"
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
git fetch --all --tags
git checkout "$BRANCH"
git pull --ff-only || true

echo "[4/8] Writing domain and token configs"
sed -Ei "s|^\s*- CTFD_URL=.*|- CTFD_URL=${CTF_DOMAIN}|" docker-compose.yml
sed -Ei "s|^\s*- DIRECT_URL=.*|- DIRECT_URL=${DIRECT_DOMAIN}|" docker-compose.yml
sed -Ei "s|^\s*- DYNAMIC_URL=.*|- DYNAMIC_URL=${DYNAMIC_DOMAIN}|" docker-compose.yml

sed -Ei "s|^token = .*|token = ${FRP_TOKEN}|" frpc/frpc.ini
sed -Ei "s|^token = .*|token = ${FRP_TOKEN}|" frps/frps.ini
sed -Ei "s|^subdomain_host = .*|subdomain_host = ${DYNAMIC_DOMAIN}|" frps/frps.ini

sed -Ei "s|server_name ctf\.[^;]+;|server_name ${CTF_DOMAIN};|g" conf/nginx/http.conf
sed -Ei "s|server_name \*\.dynamic\.[^;]+;|server_name ${WILDCARD_DYNAMIC};|g" conf/nginx/http.conf
sed -Ei "s|https://ctf\.[^$]+\$request_uri|https://${CTF_DOMAIN}\$request_uri|" conf/nginx/http.conf

sed -Ei "s|direct\.[a-zA-Z0-9.-]+|${DIRECT_DOMAIN}|g" CTFd/plugins/ctfd_owl/setup.py
sed -Ei "s|dynamic\.[a-zA-Z0-9.-]+|${DYNAMIC_DOMAIN}|g" CTFd/plugins/ctfd_owl/setup.py
sed -Ei "s|token = [^\\]*\\r\\nserver_addr|token = ${FRP_TOKEN}\\r\\nserver_addr|" CTFd/plugins/ctfd_owl/setup.py

sed -Ei "s|direct\.[a-zA-Z0-9.-]+|${DIRECT_DOMAIN}|g" CTFd/plugins/ctfd_whale/utils/setup.py
sed -Ei "s|dynamic\.[a-zA-Z0-9.-]+|${DYNAMIC_DOMAIN}|g" CTFd/plugins/ctfd_whale/utils/setup.py
sed -Ei "s|token = [^\\]*\\r\\nserver_addr|token = ${FRP_TOKEN}\\r\\nserver_addr|" CTFd/plugins/ctfd_whale/utils/setup.py

echo "[5/8] Initializing Docker Swarm and overlay network"
if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
  docker swarm init --advertise-addr 127.0.0.1
fi

if ! docker network ls --format '{{.Name}}' | grep -qx ctfd_containers; then
  docker network create --driver overlay --attachable --internal ctfd_containers
fi

echo "[6/8] Building and starting stack"
docker compose build ctfd
docker compose up -d

echo "[7/8] Waiting for app and running migrations"
ok="0"
for _ in $(seq 1 40); do
  if docker compose exec -T ctfd flask db upgrade >/dev/null 2>&1; then
    ok="1"
    break
  fi
  sleep 5
done

if [[ "$ok" != "1" ]]; then
  echo "Warning: Could not run flask db upgrade automatically."
fi

if [[ "$ISSUE_SSL" == "1" ]]; then
  echo "[8/8] Issuing wildcard SSL certificate"
  if [[ -z "$CF_DNS_API_TOKEN" ]]; then
    echo "--cf-token (or CF_DNS_API_TOKEN env) is required when --issue-ssl is set"
    exit 1
  fi
  CF_DNS_API_TOKEN="$CF_DNS_API_TOKEN" DOMAIN_ROOT="$ROOT_DOMAIN" CTFD_DIR="$INSTALL_DIR" bash scripts/issue_wildcard_cert.sh

  if [[ "$SETUP_RENEW_CRON" == "1" ]]; then
    cat > /etc/cron.d/ctfd-certbot-renew <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root cd ${INSTALL_DIR} && ${INSTALL_DIR}/scripts/certbot_renew_reload.sh >/var/log/ctfd-certbot-renew.log 2>&1
EOF
    chmod 644 /etc/cron.d/ctfd-certbot-renew
  fi
else
  echo "[8/8] SSL issuance skipped"
fi

echo
echo "Bootstrap completed"
echo "CTFd URL: https://${CTF_DOMAIN}"
echo "Direct URL: ${DIRECT_DOMAIN}"
echo "Dynamic wildcard: *.${DYNAMIC_DOMAIN}"
echo "FRP token: ${FRP_TOKEN}"
echo
echo "If DNS is not ready yet, you can still access temporary URL:"
echo "  http://$(hostname -I | awk '{print $1}')"
