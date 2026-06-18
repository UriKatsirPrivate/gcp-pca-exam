# Deploying gcp-pca-prep to Cloud Run

Next.js 16 (standalone) + Prisma 7 (PostgreSQL) on Google Cloud Run, with
Cloud SQL for PostgreSQL and Claude on Vertex AI (via the runtime service
account's Application Default Credentials).

**Database auth is passwordless (IAM).** The app connects to Cloud SQL with the
`@google-cloud/cloud-sql-connector`, authenticating as the Cloud Run service
account's own IAM identity — there is no DB password anywhere. The connection
path is chosen purely by env vars, so the same image runs against **Neon for dev**
(`DATABASE_URL`) and **Cloud SQL for prod** (`CLOUD_SQL_CONNECTION_NAME`); see
`.env.example` and `src/lib/prisma.ts`.

Replace `PROJECT_ID`, `REGION`, and `INSTANCE` placeholders throughout. The
examples assume `REGION=us-central1` and an instance named `pca-db`.

---

## (a) One-time GCP setup

```bash
export PROJECT_ID="PROJECT_ID"
export REGION="us-central1"
export INSTANCE="pca-db"
export DB_NAME="pca"
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

# 3. Cloud SQL Postgres instance + database, with IAM database auth ENABLED.
gcloud sql instances create "$INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --database-flags=cloudsql.iam_authentication=on

gcloud sql databases create "$DB_NAME" --instance="$INSTANCE"

# Full connection name PROJECT:REGION:INSTANCE — needed everywhere downstream.
export INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "$INSTANCE" \
  --format='value(connectionName)')"
echo "$INSTANCE_CONNECTION_NAME"

# 4. Runtime service account — the identity the Cloud Run service runs as AND
#    the IAM database user (one identity for app + migrations).
gcloud iam service-accounts create pca-run \
  --display-name="pca-app Cloud Run runtime"
export RUN_SA="pca-run@${PROJECT_ID}.iam.gserviceaccount.com"

#    Register it as a Cloud SQL IAM database user. The DB username is the SA
#    email WITHOUT the ".gserviceaccount.com" suffix, i.e. pca-run@PROJECT_ID.iam
gcloud sql users create "$RUN_SA" \
  --instance="$INSTANCE" \
  --type=CLOUD_IAM_SERVICE_ACCOUNT

#    Project roles for the runtime SA.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/cloudsql.instanceUser"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA}" --role="roles/aiplatform.user"

# 5. Grant the IAM DB user privileges INSIDE Postgres. `migrate deploy` needs
#    CREATE on the schema; the app needs DML. Connect once as an admin via the
#    proxy (see below) and run, replacing the role name with the IAM username:
#      GRANT ALL ON SCHEMA public TO "pca-run@PROJECT_ID.iam";
#      ALTER DEFAULT PRIVILEGES IN SCHEMA public
#        GRANT ALL ON TABLES TO "pca-run@PROJECT_ID.iam";
#    (Postgres 15+ revokes CREATE on public from non-owners by default, so this
#    grant is required even for the first migration.)

# 6. Cloud Build service account — runs the pipeline (build, migrate, deploy).
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" \
  --format='value(projectNumber)')"
export CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

#    It impersonates the runtime SA to run migrations as that IAM DB user:
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountTokenCreator"

#    Plus Cloud SQL + deploy roles:
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/cloudsql.client"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/cloudsql.instanceUser"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" --role="roles/run.admin"
#    Lets Cloud Build deploy a service that runs AS the runtime SA:
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser"

# 7. auth-secret: a long random string (Auth.js AUTH_SECRET).
npx auth secret --raw 2>/dev/null || openssl rand -base64 33 \
  | gcloud secrets create auth-secret --data-file=-

# 8. Google OAuth ("Login with Google"): store the client id/secret as env on the
#    service (or as secrets). Add the prod redirect URI to the OAuth client:
#      https://<cloud-run-url>/api/auth/callback/google
#    Then pass AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET via --set-secrets or
#    --set-env-vars in the deploy step.
```

> **No DB password and no `database-url` secret.** Auth is entirely IAM-based.
> If you ever need password auth instead, set `DB_IAM_AUTH=false` and provide
> `DB_PASSWORD` (see `.env.example`).

---

## (b) Deploy

From the project root:

```bash
gcloud builds submit --config deploy/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME,_SERVICE=pca-app,_DB_NAME=pca,_RUN_SA_EMAIL=$RUN_SA,_DB_IAM_USER=pca-run@$PROJECT_ID.iam,_ANTHROPIC_VERTEX_PROJECT_ID=$PROJECT_ID
```

The pipeline (`deploy/cloudbuild.yaml`) runs: **build -> push -> migrate ->
deploy**.

---

## (c) How migrations run (passwordless)

- `prisma generate` happens at **build time** inside the Docker image (after
  `npm ci`, before `next build`).
- `prisma migrate deploy` does **not** run during the build (no database is
  reachable then). It runs as a dedicated Cloud Build step (`migrate`) that:
  1. starts the **Cloud SQL Auth Proxy** with `--auto-iam-authn` and
     `--impersonate-service-account=$RUN_SA`, exposing a unix socket at
     `/cloudsql/<INSTANCE_CONNECTION_NAME>`,
  2. builds a `DATABASE_URL` for the IAM DB user (no password; the `@` in the
     username is percent-encoded), and
  3. runs `npx --yes prisma@7 migrate deploy`, applying `prisma/migrations/`.

> **Prerequisite:** committed migrations must exist. Generate the first one
> locally (against Neon or local Postgres) and commit it before deploying:
> ```bash
> npm run db:migrate -- --name init   # prisma migrate dev --name init
> git add prisma/migrations && git commit -m "Add initial migration"
> ```
> `migrate deploy` only applies existing migration files; it never creates them.

---

## (d) Local dev quickstart (Neon or local Postgres)

```bash
cp .env.example .env           # set AUTH_SECRET + DATABASE_URL (Neon or local)
                               # leave CLOUD_SQL_CONNECTION_NAME unset
npm run db:migrate             # prisma migrate dev (creates + applies migrations)
npm run db:seed                # tsx prisma/seed.ts
npm run dev                    # http://localhost:3000
```

`docker compose up -d db` also starts a local Postgres 16 (user/pass/db = `pca`)
if you prefer that to Neon.

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
  --set-secrets=AUTH_SECRET=auth-secret:latest \
  --set-env-vars=CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:us-central1:pca-db,DB_USER=pca-run@PROJECT_ID.iam,DB_NAME=pca,DB_IAM_AUTH=true,CLOUD_SQL_IP_TYPE=PUBLIC,LLM_PROVIDER=vertex,ANTHROPIC_VERTEX_PROJECT_ID=PROJECT_ID,CLOUD_ML_REGION=global,AUTH_TRUST_HOST=true
```

Notes:
- **No `--add-cloudsql-instances`** and **no `database-url` secret** — the
  Node connector reaches Cloud SQL over the Admin API using the runtime SA's IAM
  identity. `DB_IAM_AUTH=true` (the default on the connector path) means no
  password. Use `CLOUD_SQL_IP_TYPE=PRIVATE` if the instance has only private IP.
- `--service-account` is **required**: the service must run as the SA that is
  registered as the Cloud SQL IAM DB user.
- `LLM_PROVIDER=vertex` makes the app call **Claude on Vertex AI** using the
  runtime SA's ADC (no API key). The runtime SA needs `roles/aiplatform.user`.
- `AUTH_TRUST_HOST=true` lets Auth.js trust the Cloud Run-provided host.
- For "Login with Google", also pass `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
```
