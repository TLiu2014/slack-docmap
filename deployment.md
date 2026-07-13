# Deployment guide — DocMap on GCP (GCE e2-micro + Docker Compose)

Deploys the app to a single Google Compute Engine VM. Fits in the Always
Free tier (1 × `e2-micro` per month in `us-west1` / `us-central1` /
`us-east1`, 30 GB standard disk, 1 GB North America egress).

**One VM, one container.** The `app` container serves both the Express
API and the built React UI from the same origin. Graphs live in-memory
in the container (see `server/src/store.ts`) — no database, so restarts
wipe prior graphs. That's fine for the hackathon demo; a real deployment
would swap the store back to Prisma-over-Postgres. `docker-compose.prod.yml`
at the repo root is what runs on the VM.

**Live deployment:** `http://136.112.234.125:3000` (GCE VM `docmap` in
zone `us-central1-a`, personal project `atlas-orbit-hosting`).

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
# docker run --rm -p 3000:3000 --env-file server/.env "$IMAGE"
# → http://localhost:3000/health  should return {"ok":true}

docker push "$IMAGE"
```

Expect ~3–5 minutes for a clean build (workspace install + Vite build +
TypeScript compile). Subsequent builds are much faster thanks to Docker's
layer caching.

**Requirements:** Docker Desktop running locally, `.dockerignore` at
repo root (already included — excludes `**/node_modules` so the
container's fresh install isn't overwritten by your macOS/arm64 modules).

---

## 2. Create the VM (one-time)

```bash
export ZONE=us-central1-a
export VM_NAME=docmap

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

Two files go to the VM. The `.env` is **not** committed; you copy the
runtime secrets fresh from your local machine each time they change.

```bash
export VM_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')

# 1. Compose file — the single-service, no-DB stack.
gcloud compute scp docker-compose.prod.yml "$VM_NAME:~/docker-compose.yml" --zone="$ZONE"

# 2. Slack + LLM secrets that the container reads via env_file.
gcloud compute scp server/.env "$VM_NAME:~/app.env" --zone="$ZONE"

# 3. Compose's own .env — image URI + public URL for docker-compose to interpolate.
cat > /tmp/docmap.compose.env <<EOF
IMAGE=us-central1-docker.pkg.dev/$(gcloud config get-value project)/docmap/app:latest
UI_BASE_URL=http://$VM_IP:3000
EOF
gcloud compute scp /tmp/docmap.compose.env "$VM_NAME:~/.env" --zone="$ZONE"
rm /tmp/docmap.compose.env
```

SSH in and start the stack:

```bash
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command='
sudo gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
'
```

Expect the container to reach `Up (healthy)` within ~15 seconds. Tail logs to watch the boot:

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
curl -s http://$VM_IP:3000/health
# → {"ok":true}

# Landing + docs pages.
open "http://$VM_IP:3000/"
```

Then run `/docmap quick` from your sandbox — the DM's **Open interactive
map** button should land on the deployed URL and render the graph.

Grab the VM's external IP any time with:

```bash
gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

> **Note:** the ephemeral external IP changes if you `stop` the VM. Any
> viewer URLs already DM'd by Slack will 404 after a stop/start. To keep
> a stable URL long-term, either reserve a static external IP or put a
> domain name in front.

---

## 5. Re-deploy on code change

```bash
# 1. Rebuild + push locally.
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

# 2. On the VM, pull + restart.
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="\
  sudo docker compose pull app && \
  sudo docker compose up -d app --force-recreate && \
  sudo docker compose ps"
```

Graphs are in-memory, so any prior `?id=<uuid>` links 404 after a
restart. Judges hitting the deployed instance during judging shouldn't
notice — a `/docmap` run creates its own graph and the viewer URL is
usable within that session.

---

## 6. Cost + cleanup

- **Running**: $0 within Always Free tier. e2-micro compute, 30 GB
  standard disk, and NA egress are all in-tier. Artifact Registry storage
  is ~$0.10/GB/mo above 0.5 GB; a single DocMap image is ~200 MB, so a
  few builds worth of images stay under.
- **Stop the VM (keeps disk)**: `gcloud compute instances stop "$VM_NAME" --zone="$ZONE"` — pays only for the disk (~$1.20/mo for 30 GB). Ephemeral IP is released; restart will assign a new one.
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
  Most common cause: `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` /
  `GEMINI_API_KEY` missing from the uploaded `app.env`.
- **Judges hit "connection refused"** — firewall rule not applied. Verify
  the VM has the `docmap-http` network tag: `gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(tags)'`.
- **OOM kills on e2-micro** — 1 GB RAM is tight. If it happens under
  load, upgrade to `e2-small` (~$13/mo) or move to Cloud Run + Cloud SQL.
- **Viewer URL 404s after a container restart** — expected. The deployed
  instance uses an in-memory graph store. Ask the user to re-run
  `/docmap` and use the fresh DM link.
