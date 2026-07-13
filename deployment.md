# Deployment guide — DocMap on GCP (GCE e2-micro + Docker Compose)

Deploys the whole stack (Node server + built UI + Postgres) to a single
Google Compute Engine VM. Fits in the Always Free tier (1 × `e2-micro` per
month in `us-west1` / `us-central1` / `us-east1`, 30 GB standard disk,
1 GB North America egress).

**One VM, two containers, one persistent volume.** The `app` container
serves both the Express API and the built React UI from the same origin;
the `postgres` container stores generated graphs so they survive VM
restarts. `docker-compose.yml` at the repo root wires them together.

Assumes you already have your personal GCP account set up via
`.envrc → CLOUDSDK_CONFIG="$HOME/.config/gcloud-personal"` (matching the
`gemini-nosql-data-wrangler` pattern).

---

## 0. One-time prerequisites (per project)

Run `direnv allow` in the repo first so gcloud reads your **personal** config.

```bash
# Confirm you're on the personal account + project you intend to deploy into.
gcloud config list --format="value(core.project,core.account)"

# Enable the APIs the deploy needs (safe to re-run).
gcloud services enable \
  artifactregistry.googleapis.com \
  compute.googleapis.com

# Create an Artifact Registry repo for the image (one-time).
export REGION=us-central1
export AR_REPO=docmap
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="DocMap container images"
```

---

## 1. Build & push the image (repeat on every code change)

Build **locally** with `docker build`, then push to Artifact Registry.
Keeps compute off Cloud Build (matches the pattern used for
`gemini-nosql-data-wrangler`).

```bash
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1
export AR_REPO=docmap
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$AR_REPO/app:latest"

# One-time: authenticate the local Docker CLI against Artifact Registry.
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

# --platform matters on Apple Silicon: the GCE VM runs linux/amd64.
docker build --platform linux/amd64 -t "$IMAGE" .

# (Optional) smoke-test locally before pushing.
# The app needs Slack + LLM tokens; simplest is --env-file server/.env.
# The container also needs a DATABASE_URL that resolves — for a quick
# smoke test, an in-memory sqlite works after regenerating the client;
# see § Troubleshooting.
# docker run --rm -p 3000:3000 --env-file server/.env "$IMAGE"

docker push "$IMAGE"
```

Expect ~4–6 minutes for a clean build (workspace install + Vite build +
TypeScript compile + Prisma generate). Subsequent builds are much
faster thanks to Docker's layer caching.

**Requirements:** Docker Desktop running locally, `.dockerignore` at
repo root (already included — excludes `**/node_modules` so the
container's fresh install isn't overwritten by your macOS/arm64 modules).

---

## 2. Create the VM (one-time)

```bash
export ZONE=us-central1-a
export VM_NAME=docmap
# Auto-generate a Postgres password now; save it somewhere secure. This is
# also what the app container uses to connect — it's baked into the .env
# uploaded in step 3.
export POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
echo "Save this: POSTGRES_PASSWORD=$POSTGRES_PASSWORD"

gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --tags=docmap-http \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --metadata=startup-script='#!/bin/bash
set -e
# Install Docker + Compose on first boot.
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker $(getent passwd 1000 | cut -d: -f1) || true
# Configure Docker to auth against Artifact Registry.
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet || true
'

# Open :3000 to the internet — DocMap serves both UI and API on that port.
gcloud compute firewall-rules create docmap-http \
  --allow=tcp:3000 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=docmap-http \
  --description="DocMap public HTTP"
```

Wait ~90 seconds for the startup script to finish installing Docker
before the next step. Verify with:

```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="docker --version && docker compose version"
```

Both should print versions. If not, wait another minute — the startup
script is still running.

---

## 3. Upload the deploy files + `.env` to the VM (one-time, or when env changes)

Two files go to the VM: `docker-compose.yml` (pulls the image + wires
Postgres) and `server/.env` (Slack / LLM secrets). The `.env` is **not**
committed; you copy it fresh from your local machine.

```bash
# Copy the compose file + a slim .env (only what the deployed app needs).
gcloud compute scp docker-compose.yml "$VM_NAME:~/docker-compose.yml" --zone="$ZONE"
gcloud compute scp server/.env "$VM_NAME:~/.env" --zone="$ZONE"

# SSH in and set up the runtime env.
gcloud compute ssh "$VM_NAME" --zone="$ZONE"
```

Once you're on the VM:

```bash
# Set the Postgres password + image URI + public URL for docker-compose to interpolate.
cat > .env.deploy <<EOF
POSTGRES_PASSWORD=<paste the value you saved in step 2>
UI_BASE_URL=http://$(curl -s ifconfig.me):3000
IMAGE=us-central1-docker.pkg.dev/$(gcloud config get-value project)/docmap/app:latest
EOF

# docker-compose reads env vars from the shell OR from a file named .env.
# We merge the compose vars with the app's runtime .env:
cat .env.deploy > .env.compose
echo "" >> .env.compose
cat .env >> .env.compose
# .env is what compose reads by default.
mv .env.compose .env

# Point compose at the pushed image instead of building locally.
# Easiest: edit docker-compose.yml to replace `build: … / image: slack-docmap:latest`
# with just `image: ${IMAGE}`. Or use a compose override:
cat > docker-compose.override.yml <<'EOF'
services:
  app:
    build: !reset null
    image: ${IMAGE}
EOF

# Log Docker into Artifact Registry (uses the VM's default service-account creds).
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet

# Pull + start.
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Expect all three states to show `running` and `healthy` within ~30
seconds. Tail logs to watch the boot:

```bash
sudo docker compose logs -f app
```

Look for `[http] serving UI from /app/public`, `[http] listening on :3000`,
and `[slack] socket mode connected`.

---

## 4. Update the Slack app to use the public URL

Two places in your Slack app config need the new host:

1. **App Home** — no change needed; Socket Mode is outbound.
2. **`UI_BASE_URL`** — already set on the VM's `.env`. Every future
   `/docmap` run will DM viewer URLs like
   `http://<vm-external-ip>:3000/?id=<uuid>`.

Verify:

```bash
# From your laptop, hit the deployed URL.
curl -s http://<VM_EXTERNAL_IP>:3000/health
# → {"ok":true}

# Open the demo graph in a browser.
open "http://<VM_EXTERNAL_IP>:3000/?id=demo"
```

Then run `/docmap quick` from your sandbox — the DM's **Open interactive
map** button should land on the deployed URL and render the graph.

Grab the VM's external IP any time with:

```bash
gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

---

## 5. Re-deploy on code change

```bash
# 1. Rebuild + push locally.
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

# 2. On the VM, pull + restart.
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="\
  sudo docker compose pull app && \
  sudo docker compose up -d app && \
  sudo docker compose ps"
```

Postgres data persists across restarts (named volume `postgres-data`).

---

## 6. Cost + cleanup

- **Running**: $0 within Always Free tier. e2-micro compute, 30 GB
  standard disk, and NA egress are all in-tier. Artifact Registry storage
  is ~$0.10/GB/mo above 0.5 GB; a single DocMap image is ~200 MB.
- **Stop the VM (keeps disk + data)**: `gcloud compute instances stop "$VM_NAME" --zone="$ZONE"` — pays only for the disk (~$1.20/mo for 30 GB), Postgres data preserved.
- **Fully delete everything**:
  ```bash
  gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --quiet
  gcloud compute firewall-rules delete docmap-http --quiet
  gcloud artifacts repositories delete "$AR_REPO" --location="$REGION" --quiet
  ```

---

## Troubleshooting

- **`docker push` fails with `unauthorized`** — the local Docker CLI
  isn't authed against Artifact Registry. Re-run
  `gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet`
  and confirm you're on the personal gcloud config with
  `gcloud config list`.
- **App container restarts in a loop** — check `sudo docker compose logs app`.
  Common causes: `SLACK_BOT_TOKEN` missing from uploaded `.env`, or
  `DATABASE_URL` not resolving because Postgres isn't healthy yet. The
  `depends_on: service_healthy` should prevent the latter but a slow VM
  can still race.
- **`prisma migrate deploy` says "no migration files"** — that's expected
  for a fresh setup; the container falls back to `prisma db push` and
  creates tables from the schema.
- **Judges hit "connection refused"** — firewall rule not applied. Verify
  the VM has the `docmap-http` network tag: `gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(tags)'`.
- **OOM kills on e2-micro** — 1 GB RAM is tight. If it happens under
  load, drop `shared_buffers` in `docker-compose.yml` from 64MB to 32MB,
  or upgrade the VM to `e2-small` (~$13/mo).
