# CTFd-docker (Forked & Fully Fixed)

[![Docker](https://img.shields.io/badge/Docker-✓-blue)](https://www.docker.com/)
[![CTFd](https://img.shields.io/badge/CTFd-3.7.4-brightgreen)](https://github.com/CTFd/CTFd)
[![Whale](https://img.shields.io/badge/Whale-✓-orange)](https://github.com/frankli0324/ctfd-whale)

This repository provides a **one-command installation** for CTFd with integrated **Whale/Owl** plugins, enabling **dynamic container challenges** using Docker Swarm.

It is a fork of [huangzheng2016/CTFd-docker](https://github.com/huangzheng2016/CTFd-docker) with **critical fixes** to make the system production-ready.

---

## ✨ What's Fixed / Improved (This Fork)

- ✅ **Removed Tsinghua mirrors** – Uses default PyPI and Debian mirrors for global reliability.
- ✅ **Fixed frpc network** – Added `containers` overlay network to frpc, eliminating `lookup ... server misbehaving` errors.
- ✅ **Dynamic flags fully working** – Added `docker_id` field to `WhaleContainer` and fixed challenge type methods.
- ✅ **Container creation logic** – Implemented actual Docker container creation inside Whale's `register()` method.
- ✅ **Custom 404 page** – Replaced frps default 404 with a friendly "container starting" page.
- ✅ **Removed update nag** – Deleted the "New CTFd version available" banner from admin panel.
- ✅ **Fixed scoring bug** – Handled missing `function` attribute in dynamic challenges.

---

## 🚀 One-Command Installation

Run the following command on a fresh **Ubuntu 20.04 / 22.04** server:

```bash
curl -fsSL https://raw.githubusercontent.com/ndhoc/CTFd-docker/main/install.sh | bash
```

The script will automatically:

- Update system packages  
- Install Docker & Docker Compose  
- Clone this repository into `/opt/CTFd`  
- Initialize Docker Swarm  
- Create required overlay network `ctfd_containers`  
- Build the CTFd image (without Tsinghua mirrors)  
- Start all services  
- Initialize the database  

After completion, open your browser and navigate to:

```
http://<your-server-ip>
```

---

## ⚙️ Configuration (Before Running)

If you want to use a custom domain or change security tokens, edit the following files:

### `docker-compose.yml`

```yaml
services:
  ctfd:
    environment:
      - CTFD_URL=https://ctf.yourdomain.com
      - DIRECT_URL=https://direct.yourdomain.com
      - DYNAMIC_URL=https://dynamic.yourdomain.com
```

### `frps/frps.ini`

```ini
[common]
bind_addr = 0.0.0.0
bind_port = 7000
token = your_secure_token_here
subdomain_host = dynamic.yourdomain.com
vhost_http_port = 8009
custom_404_page = /etc/frp/404.html
```

### `frpc/frpc.ini`

```ini
[common]
token = your_secure_token_here
server_addr = frps
server_port = 7000
admin_addr = 0.0.0.0
admin_port = 7400
```

---

## ⚠️ Security Warning

This repository may contain real tokens and passwords.  
Do **NOT** make it public unless you replace sensitive values.

---

## 📁 Directory Structure

```text
.
├── CTFd/
├── conf/nginx/
├── frpc/
├── frps/
├── .data/
├── docker-compose.yml
├── Dockerfile
├── install.sh
└── README.md
```

---

## 🐳 Services

| Service | Image | Description |
|--------|------|-------------|
| ctfd | Built from Dockerfile | Main CTFd application with Whale/Owl plugins |
| nginx | nginx:stable | Reverse proxy |
| db | mariadb:10.11 | Database |
| cache | redis:4 | Cache |
| frpc | snowdreamtech/frpc:0.41.0 | FRP client |
| frps | snowdreamtech/frps:0.41.0 | FRP server |

---

## 🔧 Whale Plugin Configuration (Admin Panel)

After logging in as admin → **Admin Panel → Whale**

| Field | Value |
|------|------|
| Docker API URL | unix:///var/run/docker.sock |
| FRP Admin Addr | frpc |
| FRP Admin Port | 7400 |
| FRP Server Address | frps |
| FRP Server Port | 7000 |
| FRP Auth Token | same as in frps.ini |
| Http Domain Suffix | dynamic.yourdomain.com |
| Http Port | 80 |

---

## 🌐 DNS Setup

Point these domains to your server:

- `ctf.yourdomain.com`
- `direct.yourdomain.com`
- `*.dynamic.yourdomain.com`

**Cloudflare users:** set to **DNS only (gray cloud)**.

---

## 🔥 Firewall

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 10001:10200/tcp
ufw enable
```

---

## 🧪 Creating a Dynamic Docker Challenge

1. Build image:
```bash
docker build -t web-demo:latest .
```

2. In CTFd:
- Type: `dynamic_docker_whale`
- Docker Image: `web-demo:latest`
- FRP Type: HTTP (Port 80)
- Leave Flag empty

3. Container must read `FLAG` env variable (e.g. `/flag.txt`)

---

## 📝 Troubleshooting

- **frpc error** → Check network `ctfd_containers`
- **No container created** → Check Docker socket mount
- **404 error** → Check wildcard DNS
- **Flag incorrect bug** → Reload page

---

## Optional: Custom JS (Correct Popup)

```javascript
CTFd._internal.challenge.submit = async function(pre, post) {
    const result = await pre();
    if (result.data.status === 'correct') {
        alert('✅ Correct! You solved the challenge.');
    } else if (result.data.status === 'incorrect') {
        alert('❌ Incorrect flag.');
    }
    return post(result);
};
```

---

## 🙏 Credits

- Original: https://github.com/huangzheng2016/CTFd-docker  
- CTFd: https://github.com/CTFd/CTFd  
- Whale: https://github.com/frankli0324/ctfd-whale  

---

## 📄 License

Same as original repository.
