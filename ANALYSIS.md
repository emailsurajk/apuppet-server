# aPuppet Project — Full Analysis

## What the System Does

aPuppet is an open-source **remote control / remote support platform** for Android devices.

**Architecture (3-tier):**
```
Android App  ←→  Janus WebRTC Server  ←→  Web Admin (browser)
 (mobile agent)   (media relay)             (supervisor UI)
```

A supervisor opens the web-admin in a browser, enters the Session ID + Password shown on the Android device, and gains real-time screen view with gesture control (tap, swipe, back, home).

---

## Android App

| Item | Detail |
|------|--------|
| Purpose | Remote control mobile agent |
| Screen streaming | H.264 via Android `MediaCodec` → RTP → Janus `janus.plugin.streaming` |
| Control channel | WebRTC DataChannel via `janus.plugin.textroom` |
| Authentication | Session ID (8 chars) + PIN (4 chars) per session |
| Default server port | 9443 HTTPS |
| Default server path | `/rtp-web-admin/` |
| Permissions | INTERNET, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PROJECTION, SYSTEM_ALERT_WINDOW, ACCESS_WIFI_STATE |
| Special services | AccessibilityService (`GestureDispatchService`) for gesture dispatch; MediaProjection for screen capture |
| Min SDK | 28 (Android 9) |
| Target SDK | 30 |
| Compile SDK | 35 |

### Key Components

| Class | Role |
|-------|------|
| `MainActivity` | Main UI — shows Session ID, password, connection state |
| `SettingsActivity` | Server URL, API secret, device name, bitrate, FPS config |
| `GestureDispatchService` | AccessibilityService — executes incoming tap/swipe/key gestures |
| `ScreenSharingService` | Foreground service — captures + H.264 encodes + RTP streams screen |
| `JanusSessionPollService` | Background HTTP long-poll for Janus session events |
| `SharingEngineJanus` | Orchestrates Janus session lifecycle and WebRTC peers |
| `JanusTextRoomPlugin` | WebRTC DataChannel peer for receiving control commands |
| `JanusStreamingPlugin` | Creates RTP stream for video/audio in Janus |
| `JanusServerApi` | Retrofit interface for Janus REST API |
| `SettingsHelper` | SharedPreferences wrapper for all app settings |

### Connection Flow

1. App calls `POST /janus` → creates Janus session
2. Attaches two plugins: `janus.plugin.textroom` + `janus.plugin.streaming`
3. Creates WebRTC PeerConnection for DataChannel (textroom)
4. Creates RTP stream in Janus (streaming plugin) for video/audio
5. Polls `GET /janus/{session}` for incoming commands
6. On supervisor connect: starts screen capture via `MediaProjection` → `MediaCodec` → RTP

### Default Stream Parameters
- Bitrate: 256 kbps
- Frame rate: 10 fps
- Max resolution: 800×800

### Dependencies
- `io.github.webrtc-sdk:android:144.7559.01` — WebRTC
- `retrofit:2.3.0` + `jackson` — REST API
- `net.majorkernelpanic.streaming` — RTP packetization (bundled)
- Firebase Crashlytics — error reporting

---

## Server

### Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Media server | Janus WebRTC (Docker: `headwindmdm/janus-gateway`) | `0.10.7` |
| Web server | Nginx | `1.18-alpine` |
| SSL | Certbot / LetsEncrypt | `v1.4.0` |
| Frontend | HTML/JS (jQuery 3.3.1, Bootstrap 4.3.1, WebRTC Adapter 6.4.0) | — |
| Frontend build | Node.js + Gulp (Docker: `headwindmdm/node-gulp-builder:15.2.0-alpine3.12-0.1`) | — |
| Orchestration | Docker Compose | `1.26.0` |
| Deployment | Ansible playbooks | `2.9.x` |

### Ports

| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | Nginx HTTP (redirects to HTTPS) |
| 443 | TCP | Nginx HTTPS (web-admin + Janus proxy) |
| 8088 | TCP | Janus HTTP REST API |
| 8089 | TCP | Janus HTTPS REST API |
| 8989 | TCP | Janus Secure WebSockets (wss://) |
| 7889 | TCP | Janus Admin API (disabled by default) |
| 10000–10500 | UDP | RTP video/audio streams |

### Nginx Routes
```
/ → 302 redirect to /web-admin/
/web-admin/ → static files from dist/web-admin/html/
/janus → proxy to http://127.0.0.1:8088/janus
```

### Ansible Playbooks (deploy/)

| Playbook | What it does |
|----------|-------------|
| `install.yaml` | Orchestrator — imports all sub-playbooks |
| `pre_requisites.yaml` | Installs Docker, Python 3, pip packages (docker==4.3.1, docker-compose==1.27.4) |
| `pre_nginx.yaml` | Generates 2048-bit DH params (slow!) |
| `pre_apuppet.yaml` | Generates random secrets, processes all config templates, creates docker-compose.yaml |
| `pre_certbot.yaml` | Runs certbot to obtain LetsEncrypt SSL certificate |
| `pre_webadmin.yaml` | Builds web-admin frontend (runs Gulp Docker container) |
| `start.yaml` | Starts all Docker Compose services, prints welcome message + API secret |

### Generated Secrets
- `janus_api_secret` — 8-char random alphanumeric → used in Android app Settings > Secret
- `janus_admin_api_secret` — 15-char random alphanumeric → admin API
- Both stored in `deploy/dist/credentials/`

### install.sh Flow
1. Detect OS (Ubuntu only) and version
2. Install Ansible 2.9.x
3. Run `deploy/install.yaml`
4. Run `deploy/start.yaml`

---

## Configuration

### config.yaml (minimal required)
```yaml
hostname: "your.domain.com"    # Must have DNS A record pointing to server
email: "admin@your.domain.com" # Used for LetsEncrypt
```

### config.defaults.yaml (key options)
```yaml
api_http_port: 8088
api_https_port: 8089
api_wss_port: 8989
rtp_port_range: 10000-10500
is_nginx_enabled: true
is_certbot_enabled: true
web_http_port: 80
web_https_port: 443
```

---

## Ubuntu 22.04 Deployment — Critical Notes

### Problem
`install.sh` **explicitly rejects Ubuntu 22.04** — only 16.04, 18.04, 20.04 are accepted.

### Fix

**Step 1 — Patch install.sh** (`server/apuppet-server/install.sh`)

Change:
```bash
"20.04")
  echo "OK, start installing on actual LTS ..."
  ansible_install_newstyle
  ;;
```
To:
```bash
"20.04" | "22.04")
  echo "OK, start installing on actual LTS ..."
  ansible_install_newstyle
  ;;
```

**Step 2 — Install Ansible on 22.04**

Ansible 2.9.x is not in Ubuntu 22.04 repos. Options:
```bash
# Option A: via pip (recommended)
sudo apt-get install -y python3-pip
pip3 install "ansible==2.9.*"

# Option B: ansible-core from apt (newer but compatible)
sudo apt-get install -y ansible
```

**Step 3 — Fix Docker repo for Ubuntu 22.04** (if `pre_requisites.yaml` fails)

The playbook may use the Ubuntu `focal` keyring/repo. Manually install Docker:
```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu jammy stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

**Step 4 — Set up config and run**
```bash
cd server/apuppet-server
# Edit config.yaml with hostname and email
sudo ./install.sh
```

**Step 5 — Firewall (ufw)**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8088/tcp
sudo ufw allow 8089/tcp
sudo ufw allow 8989/tcp
sudo ufw allow 10000:10500/udp
```

**Step 6 — Android App settings after install**
- Server URL: `https://your.domain.com:9443/rtp-web-admin/`
- Secret: contents of `deploy/dist/credentials/janus_api_secret`

### No-Domain / LAN-Only Setup
Disable Certbot and Nginx in `deploy/config.defaults.yaml`:
```yaml
is_certbot_enabled: false
is_nginx_enabled: false
```
Then Android app connects directly to Janus on port 8088 (HTTP, no SSL).

### DNS Requirement
The Ansible `tasks_check_settings.yaml` validates that `hostname` resolves to a local IP before running. DNS must be configured BEFORE running `install.sh`.

---

## Web Admin Interface

Accessed at `https://your.domain.com/web-admin/`

1. Enter Session ID + Password shown on the Android device
2. Video stream appears — click/drag on video to control device
3. Navigation buttons: Back, Home, Recents
4. Debug panel (hidden by default): stream stats, text chat

---

## Useful Docker Compose Commands (after install)

```bash
cd server/apuppet-server

# View running containers
sudo docker-compose ps

# View logs
sudo docker-compose logs -f janus
sudo docker-compose logs -f nginx

# Restart all
sudo docker-compose restart

# Stop all
sudo docker-compose down

# Start all
sudo docker-compose up -d
```
