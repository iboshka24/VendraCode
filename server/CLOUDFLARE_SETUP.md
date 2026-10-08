# Cloudflare Subdomain Setup: `brain.vendra.uz`
### Multiplayer Swarm Coordination & Central GitHub Repo Linking

This guide explains how to connect your domain `vendra.uz` to the **VendraCode The Shared Brain** coordination layer on `brain.vendra.uz` without affecting your main website on `vendra.uz`.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │        vendra.uz (Main Website)        │
                      │         (Remains Unchanged)            │
                      └────────────────────────────────────────┘

                                          ▼

                      ┌────────────────────────────────────────┐
                      │    Subdomain: brain.vendra.uz          │
                      │  Cloudflare Worker / Reverse Proxy     │
                      └────────────────────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                      ┌────────────────────────┐
     │   You (VendraCode)     │                      │ Friends (VendraCode)   │
     │   Local OpenCode / CLIs│                      │ Claude Code / Codex    │
     └────────────────────────┘                      └────────────────────────┘
                  │                                               │
                  └───────────────┬───────────────────────────────┘
                                  ▼
                ┌───────────────────────────────────┐
                │ Central Shared GitHub Repository  │
                │ e.g. github.com/ibrohim/repo      │
                │ (Isolated Worktrees + 5s Sync)    │
                └───────────────────────────────────┘
```

---

## Method 1: Deploy with Cloudflare Workers (Recommended - Free & Serverless)

VendraCode comes with a ready-to-deploy Cloudflare Worker located in [`cloudflare/worker.js`](file:///home/ibrohim/VendraCode/cloudflare/worker.js) that runs on Cloudflare's global edge network with native WebSocket support.

### Step 1: Deploy via Terminal
Run the deployment script from your project root:
```bash
/home/ibrohim/VendraCode/scripts/deploy-cloudflare.sh
```
Or manually with Wrangler:
```bash
cd /home/ibrohim/VendraCode/cloudflare
npx wrangler deploy
```

### Step 2: Configure Route in Cloudflare Dashboard
1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) and select your domain **vendra.uz**.
2. Go to **Workers & Pages** -> **Routes**.
3. Click **Add route**:
   - **Route**: `brain.vendra.uz/*`
   - **Worker**: `vendracode-brain`
4. Go to **DNS** -> **Records** and add a DNS record for the subdomain:
   - **Type**: `CNAME`
   - **Name**: `brain`
   - **Target**: `100::` (or `vendracode-brain.<your-subdomain>.workers.dev`)
   - **Proxy status**: **Proxied (Orange Cloud)** ☁️
   - **TTL**: Auto

---

## Method 2: Self-Hosted on VPS with Cloudflare DNS Proxy

If you run `server/brain-server.js` on your own server or VPS:

1. **DNS Settings on Cloudflare**:
   - Go to **DNS** -> **Records**.
   - **Type**: `A`
   - **Name**: `brain`
   - **IPv4 address**: `<Your-VPS-IP>`
   - **Proxy status**: **Proxied (Orange Cloud)** ☁️

2. **SSL/TLS Setting**:
   - Go to **SSL/TLS** -> set encryption mode to **Full (strict)** or **Full**.

3. **WebSockets**:
   - Go to **Network** -> ensure **WebSockets** toggle is **ON** (Enabled by default on Cloudflare).

---

## How to Link Everyone to One GitHub Repo in VendraCode

1. In VendraCode, click **Share Session** in the top title bar (or press `Ctrl+Shift+S`).
2. In the **Linked GitHub Repository** field, enter your repository URL:
   `https://github.com/ibrohim/your-project`
3. Click **Copy Link**. The link will look like:
   ```
   https://brain.vendra.uz/session/lobby-join-race?repo=https://github.com/ibrohim/your-project&token=vd-live-8a13c2
   ```
4. Send the link to your friends.
5. When your friends open VendraCode and click **Join Friend's Swarm**, they paste the link and click **Clone Shared Repo & Join Swarm**.
6. VendraCode will:
   - Clone or checkout the exact same GitHub repository in their local workspace.
   - Attach their local agents (Claude Code, OpenCode, Codex, Cline).
   - Sync file locks, cursors, and 5-second Git snapshots in real time via `brain.vendra.uz`!
