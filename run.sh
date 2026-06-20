# gcloud auth login
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID="landing-zone-demo-341118"
export CLOUD_ML_REGION="global"
export CLAUDE_CODE_EFFORT_LEVEL=xhigh
gcloud auth application-default login
"$(dirname "$0")/setup-data-sharing.sh"
npx @anthropic-ai/claude-code