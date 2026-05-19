#!/usr/bin/env bash
# Read-only smoke checks for the Multi-Agent AIOps local demo.
#
# This script reports local readiness without starting/stopping services and
# without mutating .env, logs, data, databases, Docker containers, or vector
# stores.

set -u

BASE_URL="${BASE_URL:-}"
TIMEOUT_SEC="${TIMEOUT_SEC:-3}"
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

report() {
  local status="$1"
  local name="$2"
  local detail="${3:-}"

  case "$status" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac

  if [ -n "$detail" ]; then
    printf '[%s] %s - %s\n' "$status" "$name" "$detail"
  else
    printf '[%s] %s\n' "$status" "$name"
  fi
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

env_value() {
  local name="$1"
  local default_value="${2:-}"
  if [ ! -f ".env" ]; then
    printf '%s' "$default_value"
    return
  fi
  local line
  line="$(grep -E "^[[:space:]]*${name}[[:space:]]*=" .env | head -n 1 || true)"
  if [ -z "$line" ]; then
    printf '%s' "$default_value"
    return
  fi
  printf '%s' "${line#*=}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

version_check() {
  local name="$1"
  shift
  local output
  output="$("$@" 2>&1)"
  local code=$?
  if [ "$code" -eq 0 ]; then
    report PASS "$name" "$(printf '%s' "$output" | head -n 1)"
  else
    report WARN "$name" "$(printf '%s' "$output" | tr '\n' ' ' | sed 's/[[:space:]][[:space:]]*/ /g')"
  fi
}

http_check() {
  local name="$1"
  local url="$2"
  local output
  output="$(curl -fsS --max-time "$TIMEOUT_SEC" -o /dev/null -w '%{http_code}' "$url" 2>&1)"
  local code=$?
  if [ "$code" -eq 0 ]; then
    report PASS "$name" "HTTP $output $url"
  else
    report WARN "$name" "unavailable: $(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

json_check() {
  local name="$1"
  local url="$2"
  local output
  output="$(curl -fsS --max-time "$TIMEOUT_SEC" "$url" 2>&1)"
  local code=$?
  if [ "$code" -eq 0 ] && [ -n "$output" ]; then
    report PASS "$name" "response received $url"
  else
    report WARN "$name" "unavailable: $(printf '%s' "$output" | tr '\n' ' ')"
  fi
}

docker_compose_ps() {
  if ! have_cmd docker; then
    report WARN "Docker Compose status" "docker command not found"
    return
  fi
  local output
  output="$(docker compose ps 2>&1)"
  local code=$?
  if [ "$code" -eq 0 ]; then
    local lines
    lines="$(printf '%s\n' "$output" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
    report PASS "Docker Compose status" "$lines output lines"
  else
    report WARN "Docker Compose status" "$(printf '%s' "$output" | tr '\n' ' ' | sed 's/[[:space:]][[:space:]]*/ /g')"
  fi
}

printf 'Multi-Agent AIOps read-only smoke check\n'
printf 'Working directory: %s\n\n' "$(pwd)"

missing=""
for marker in "README.md" "app/main.py" "mcp_servers" "scripts" "docker-compose.yml"; do
  if [ ! -e "$marker" ]; then
    missing="${missing}${marker} "
  fi
done
if [ -z "$missing" ]; then
  report PASS "Repository root" "required project markers found"
else
  report FAIL "Repository root" "missing: $missing"
fi

if [ -f ".env" ]; then
  report PASS ".env presence" ".env exists"
else
  report WARN ".env presence" ".env not found; runtime config may be incomplete"
fi

if [ -x ".venv/Scripts/python.exe" ]; then
  version_check "Virtualenv Python" ".venv/Scripts/python.exe" --version
elif [ -x ".venv/bin/python" ]; then
  version_check "Virtualenv Python" ".venv/bin/python" --version
else
  report WARN "Virtualenv Python" "no .venv Python executable found"
fi

if have_cmd python3; then
  version_check "System Python" python3 --version
elif have_cmd python; then
  version_check "System Python" python --version
elif [ -x ".venv/Scripts/python.exe" ] || [ -x ".venv/bin/python" ]; then
  report PASS "Python" "virtualenv Python available"
else
  report FAIL "Python" "no virtualenv or system Python found"
fi

if have_cmd node; then
  version_check "Node.js" node --version
else
  report WARN "Node.js" "node command not found"
fi

if have_cmd docker; then
  version_check "Docker CLI" docker --version
else
  report WARN "Docker CLI" "docker command not found"
fi
docker_compose_ps

if [ -z "$BASE_URL" ]; then
  port="$(env_value PORT 9900)"
  BASE_URL="http://localhost:${port}"
fi
BASE_URL="${BASE_URL%/}"

if have_cmd curl; then
  http_check "FastAPI health" "${BASE_URL}/api/v1/health"
  http_check "FastAPI readiness" "${BASE_URL}/api/v1/health/ready"
  json_check "Skills endpoint" "${BASE_URL}/api/v1/skills"

  open_websearch_base="$(env_value OPEN_WEBSEARCH_BASE_URL http://127.0.0.1:3210)"
  open_websearch_base="${open_websearch_base%/}"
  http_check "open-webSearch health" "${open_websearch_base}/health"
else
  report WARN "HTTP checks" "curl command not found"
fi

printf '\nSummary: %s pass, %s warning, %s critical failure(s)\n' "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0

