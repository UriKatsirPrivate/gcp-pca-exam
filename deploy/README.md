# Deploying gcp-pca-prep to Cloud Run

Next.js 16 (standalone) + Prisma 7 (PostgreSQL) on Google Cloud Run, with
Cloud SQL for PostgreSQL and Claude on Vertex AI (via the runtime service
account's Application Default Credentials).

Replace `PROJECT_ID`, `REGION`, and `INSTANCE` placeholders throughout. The
examples assume `REGION=us-central1` and an instance named `pca-db`.

---

## (a) One-time GCP setup

```bash
export PROJECT_ID="PROJECT_ID"
export REGION="us-central1"
export INSTANCE="pca-db"
export DB_NAME="pca"
export DB_USER="pca"
export REPO="pca"

gcloud config set project "$PROJECT_ID"

# 1. Enable required APIs.
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com

# 2. Artifact Registry repo "pca".
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="gcp-pca-prep app images"

# 3. Cloud SQL Postgres instance + database + user.
gcloud sql instances create "$INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION"

gcloud sql databases create "$DB_NAME" --instance="$INSTANCE"

# Choose a strong password; you will embed it in the database-url secret below.
gcloud sql users create "$DB_USER" --instance="$INSTANCE" --password="CHANGE_ME"

# Full connection name PROJECT:REGION:INSTANCE — needed everywhere downstream.
export INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "$INSTANCE" \
  --format='value(connectionName)')"
echo "$INSTANCE_CONNECTION_NAME"

# 4. Secrets.
#    database-url uses the Cloud Run unix-socket form:
#      postgresql://USER:PASS@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE
printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' \
  "$DB_USER" "CHANGE_ME" "$DB_NAME" "$INSTANCE_CONNECTION_NAME" \
  | gcloud secrets create database-url --data-file=-

# auth-secret: a long random string (Auth.js AUTH_SECRET).
npx auth secret --raw 2>/dev/null || openssl rand -base64 33 \
  | gcloud secrets create auth-secret --data-file=-

# (Optional) Only if you run LLM_PROVIDER=anthropic instead of vertex:
# printf 'sk-ant-...' | gcloud secrets create anthropic-api-key --data-file=-

# 5. IAM grants.
#    Cloud Build SA: needs to read the db-url secret and connect to Cloud SQL
#    so step 3 (prisma migrate deploy) works.
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" \
  --format='value(projectNumber)')"
export CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/secretmanager.secretAccessor"
# Needed for `gcloud run deploy` from the deploy step:
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/iam.serviceAccountUser"

#    Runtime SA: the identity the Cloud Run service runs as. By default this is
#    the Compute Engine default SA. For least privilege, create a dedicated one:
gcloud iam service-accounts create pca-run \
  --display-name="pca-app Cloud Run runtime"
export RUN_SA="pca-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/aiplatform.user"
```

> If you use the dedicated `pca-run` runtime SA, add
> `--service-account=$RUN_SA` to the `gcloud run deploy` command (and to the
> `deploy` step in `cloudbuild.yaml`). Otherwise the Compute Engine default SA
> is used and must carry the three roles above.

---

## (b) Deploy

From the project root:

```bash
gcloud builds submit --config deploy/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,_SERVICE=pca-app,_ANTHROPIC_VERTEX_PROJECT_ID=$PROJECT_ID
```

The pipeline (`deploy/cloudbuild.yaml`) runs: **build -> push -> migrate ->
deploy**.

---

## (c) How migrations run

- `prisma generate` happens at **build time** inside the Docker image (after
  `npm ci`, before `next build`).
- `prisma migrate deploy` does **not** run during the build (no database is
  reachable then). It runs as a dedicated Cloud Build step (`migrate`) that:
  1. starts the **Cloud SQL Auth Proxy** in unix-socket mode at
     `/cloudsql/<INSTANCE_CONNECTION_NAME>`,
  2. runs `npx --yes prisma@7 migrate deploy` against `DATABASE_URL` (pulled
     from the `database-url` secret), applying everything in
     `prisma/migrations/`.

> **Prerequisite:** committed migrations must exist. Generate the first one
> locally and commit it before deploying:
> ```bash
> npm run db:migrate -- --name init   # prisma migrate dev --name init
> git add prisma/migrations && git commit -m "Add initial migration"
> ```
> `migrate deploy` only applies existing migration files; it never creates them.

---

## (d) Local dev quickstart

```bash
docker compose up -d db        # Postgres 16 on localhost:5432 (user/pass/db = pca)
cp .env.example .env           # adjust AUTH_SECRET; DATABASE_URL already points at local db
npm run db:migrate             # prisma migrate dev (creates + applies migrations)
npm run db:seed                # tsx prisma/seed.ts
npm run dev                    # http://localhost:3000
```

---

## (e) The exact `gcloud run deploy` command

`cloudbuild.yaml` runs this for you; this is the equivalent standalone command
for manual deploys / reference. Do **not** set `PORT` — Cloud Run injects it
(8080) and the image already sets `HOSTNAME=0.0.0.0`.

```bash
gcloud run deploy pca-app \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/pca/app:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --service-account=pca-run@PROJECT_ID.iam.gserviceaccount.com \
  --add-cloudsql-instances=PROJECT_ID:us-central1:pca-db \
  --set-secrets=DATABASE_URL=database-url:latest,AUTH_SECRET=auth-secret:latest \
  --set-env-vars=LLM_PROVIDER=vertex,ANTHROPIC_VERTEX_PROJECT_ID=PROJECT_ID,CLOUD_ML_REGION=global,AUTH_TRUST_HOST=true
```

Notes:
- `--add-cloudsql-instances` mounts the unix socket at
  `/cloudsql/PROJECT_ID:us-central1:pca-db`, matching the `?host=/cloudsql/...`
  in the `database-url` secret.
- `--set-secrets` pins to explicit Secret Manager versions (use `:latest` or a
  numeric version such as `:3`).
- `LLM_PROVIDER=vertex` makes the app call **Claude on Vertex AI** using the
  runtime SA's ADC (no API key). `CLOUD_ML_REGION=global` and
  `ANTHROPIC_VERTEX_PROJECT_ID` complete the Vertex config. The runtime SA must
  have `roles/aiplatform.user`.
- `AUTH_TRUST_HOST=true` lets Auth.js trust the Cloud Run-provided host.
```
