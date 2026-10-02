#!/usr/bin/env bash
# Production deploy: Cloud Build (build -> push -> migrate -> deploy) to Cloud Run service
# pca-app in me-west1, project landing-zone-demo-341118.
#
# Ships the local working tree (gcloud uploads the source), so commit/push first.
# Override any value via env, e.g. PROJECT_ID=... ./deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # absolute paths: required by gcloud here

PROJECT_ID="${PROJECT_ID:-landing-zone-demo-341118}"
# NOT the cloudbuild.yaml default (us-central1): the live service and Cloud SQL instance are in me-west1.
REGION="${REGION:-me-west1}"
INSTANCE="${INSTANCE:-pca-db}"
SERVICE="${SERVICE:-pca-app}"
DB_NAME="${DB_NAME:-pca}"
RUN_SA="pca-run@${PROJECT_ID}.iam.gserviceaccount.com"
DB_IAM_USER="pca-run@${PROJECT_ID}.iam"   # run SA email without ".gserviceaccount.com"

# _AUTH_URL, _ADMIN_EMAILS (space-separated), _CPU, _MEMORY use the cloudbuild.yaml defaults.
# _ADMIN_EMAILS must NOT be comma-separated (collides with --substitutions delimiter).
exec gcloud builds submit "$ROOT" \
  --project "$PROJECT_ID" \
  --config "$ROOT/deploy/cloudbuild.yaml" \
  --substitutions="_REGION=${REGION},_INSTANCE_CONNECTION_NAME=${PROJECT_ID}:${REGION}:${INSTANCE},_SERVICE=${SERVICE},_DB_NAME=${DB_NAME},_RUN_SA_EMAIL=${RUN_SA},_DB_IAM_USER=${DB_IAM_USER},_ANTHROPIC_VERTEX_PROJECT_ID=${PROJECT_ID}"
