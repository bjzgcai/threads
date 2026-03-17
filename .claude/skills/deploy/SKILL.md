## Deploy Skill

Deploy NodeBB to the remote server. Supports first-time environment setup and fast subsequent syncs.

### Server Details

- **Host**: `39.102.58.68`
- **User**: `ecs-user`
- **SSH Key**: `~/.ssh/wu.pem`
- **Remote path**: `/home/ecs-user/NodeBB`
- **SSH alias**: `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68`

---
### Step 0 — git commit and push your changes

### Step 1 — Check if setup is needed

Before doing anything, check if the remote env is already bootstrapped:

```bash
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "test -f /home/ecs-user/NodeBB/config.json && echo READY || echo NEEDS_SETUP"
```

- If output is `READY` → skip to **Step 3 (Sync)**
- If output is `NEEDS_SETUP` → continue with **Step 2 (First-time Setup)**

---

### Step 2 — First-time environment setup (run once)

Only run this block when the remote env is not yet configured.

```bash
# 1. Install Node.js (if not present)
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "
  command -v node || (
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - &&
    sudo apt-get install -y nodejs
  )
"

# 2. Clone the repo (if not present)
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "
  test -d /home/ecs-user/NodeBB || git clone https://github.com/NodeBB/NodeBB.git /home/ecs-user/NodeBB
"

# 3. Install npm dependencies
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "
  cd /home/ecs-user/NodeBB && npm install --omit=dev
"

# 4. Run setup wizard (interactive — configure DB, admin, URL, etc.)
ssh -i ~/.ssh/wu.pem -t ecs-user@39.102.58.68 "
  cd /home/ecs-user/NodeBB && ./nodebb setup
"
```

After setup completes, `config.json` will exist on the remote. Future deploys skip this block.

---

### Step 3 — Sync built code (every deploy)

This is the fast path for all subsequent deploys. It syncs only the built output and source files — **not** node_modules.

```bash
# 1. Build locally first
./nodebb build

# 2. Sync source + build output to server (exclude node_modules, config, logs)
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='config.json' \
  --exclude='*.log' \
  --exclude='.git/' \
  --exclude='build/uploads/' \
  -e "ssh -i ~/.ssh/wu.pem" \
  ./ ecs-user@39.102.58.68:/home/ecs-user/NodeBB/

# 3. Install any new/changed dependencies on remote
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "
  cd /home/ecs-user/NodeBB && npm install --omit=dev
"

# 4. Restart NodeBB with env vars from .env.prod
ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "
  cd /home/ecs-user/NodeBB &&
  ./nodebb stop;
  set -a && source .env.prod && set +a &&
  ./nodebb start
"
```

---

### Quick reference

| Task | Command |
|---|---|
| SSH into server | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68` |
| Check server status | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "cd /home/ecs-user/NodeBB && ./nodebb status"` |
| Restart with env | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "cd /home/ecs-user/NodeBB && ./nodebb stop; set -a && source .env.prod && set +a && ./nodebb start"` |
| View logs | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "cd /home/ecs-user/NodeBB && ./nodebb log"` |
| Stop NodeBB | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "cd /home/ecs-user/NodeBB && ./nodebb stop"` |
| Full rebuild on remote | `ssh -i ~/.ssh/wu.pem ecs-user@39.102.58.68 "cd /home/ecs-user/NodeBB && ./nodebb build"` |
