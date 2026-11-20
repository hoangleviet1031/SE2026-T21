#!/usr/bin/env bash
# Tự deploy staging khi main có commit mới đã qua CI. Chạy bởi survey-autodeploy.timer
# (scripts/systemd/), mỗi 2 phút. Cài, tạm dừng, gỡ: docs/deploy.md "Tự deploy".
# Chạy thử không deploy: AUTO_DEPLOY_DRY_RUN=1 ~/app/scripts/auto-deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.local/state/survey-deploy}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-$HOME/.survey-deploy.lock}"
DRY_RUN="${AUTO_DEPLOY_DRY_RUN:-}"

log() { echo "auto-deploy: $*"; }
err() { echo "auto-deploy: $*" >&2; }

# Dùng chung khoá với deploy.sh: deploy tay đang chạy thì lần này nhường.
exec 9>"$LOCK_FILE"
rc=0
flock -n 9 || rc=$?
if [ "$rc" = 1 ]; then
  log "đang có lần deploy khác chạy, lần sau thử lại"
  exit 0
elif [ "$rc" != 0 ]; then
  # Không phải "đang bận" (vd. thiếu flock): báo lỗi để unit đỏ, không im lặng bỏ qua mãi.
  err "không lấy được khoá $LOCK_FILE (flock trả $rc)"
  exit 1
fi

# Đang quay lại bản trước (HEAD detached) thì không được kéo main đè lên (docs/deploy.md).
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != main ]; then
  log "~/app đang ở $branch, không phải main (đang quay lại bản trước?), bỏ qua"
  exit 0
fi

git fetch --quiet origin main
target=$(git rev-parse origin/main)
short=${target:0:7}

# So với sha deploy thành công gần nhất chứ không so HEAD: deploy.sh có thể đã pull
# xong rồi mới hỏng lúc khởi động lại, khi đó HEAD mới nhưng server chưa chạy bản đó.
deployed=$(cat "$STATE_DIR/deployed-sha" 2>/dev/null || git rev-parse HEAD)
if [ "$target" = "$deployed" ]; then
  [ -n "$DRY_RUN" ] && log "[thử] đã chạy bản mới nhất $short, không làm gì"
  exit 0
fi

# Commit đã biết là CI đỏ hoặc deploy hỏng thì không thử lại mỗi 2 phút.
# Muốn thử lại: xoá file skip-sha hoặc chạy deploy.sh tay.
skip=$(cut -d' ' -f1 "$STATE_DIR/skip-sha" 2>/dev/null || true)
if [ "$target" = "$skip" ]; then
  [ -n "$DRY_RUN" ] && log "[thử] bỏ qua $short: $(cat "$STATE_DIR/skip-sha")"
  exit 0
fi

# Repo public nên gọi API không cần token (60 lần/giờ mỗi IP). Chỉ gọi khi có commit mới.
remote=$(git remote get-url origin)
repo=${remote#https://github.com/}
repo=${repo#git@github.com:}
repo=${repo%.git}
api="https://api.github.com/repos/$repo/actions/workflows/ci.yml/runs?head_sha=$target&event=push&branch=main&per_page=1"

body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT
code=$(curl -sS -o "$body_file" -w '%{http_code}' -H 'Accept: application/vnd.github+json' "$api") || code=000
if [ "$code" != 200 ]; then
  # Mạng lỗi, GitHub lỗi hay hết lượt gọi (403/429) đều là tạm thời: lần sau hỏi lại.
  err "không hỏi được GitHub về CI của $short (HTTP $code), lần sau thử lại"
  exit 0
fi

# In: "<status> <conclusion> <run id> <url>", hoặc "none" khi CI chưa có lượt nào cho sha này.
read -r status conclusion run_id run_url < <(node -e '
  let s = "";
  process.stdin.on("data", (c) => (s += c)).on("end", () => {
    const run = JSON.parse(s).workflow_runs?.[0];
    console.log(run ? `${run.status} ${run.conclusion ?? "-"} ${run.id} ${run.html_url}` : "none - - -");
  });
' < "$body_file")

if [ "$status" != completed ]; then
  log "CI của $short chưa xong ($status), lần sau thử lại"
  exit 0
fi

if [ "$conclusion" != success ]; then
  # Gồm cả "cancelled": CI trên main có cancel-in-progress, hai lần merge sát nhau thì lượt
  # của commit cũ bị huỷ. Lúc đó origin/main thường đã là commit mới, nên script hỏi CI của
  # commit mới và không bao giờ deploy commit cũ. Chỉ khi main dừng ở commit bị huỷ mới tới đây.
  err "bỏ qua $short: CI $conclusion ($run_url)"
  if [ -z "$DRY_RUN" ]; then
    mkdir -p "$STATE_DIR"
    echo "$target ci-$conclusion $(date -Is)" > "$STATE_DIR/skip-sha"
  fi
  exit 0
fi

if [ -n "$DRY_RUN" ]; then
  log "[thử] sẽ deploy $short (CI xanh: $run_url)"
  exit 0
fi

log "CI xanh ($run_url), deploy $short"
# deploy.sh chỉ fast-forward tới đúng sha này, kể cả khi main đã có thêm commit chưa qua CI.
if DEPLOY_LOCK_HELD=1 scripts/deploy.sh "$target"; then
  log "deploy $short xong (CI run $run_id)"
else
  mkdir -p "$STATE_DIR"
  echo "$target deploy-hong $(date -Is)" > "$STATE_DIR/skip-sha"
  err "deploy $short HỎNG, xem các dòng trên (journalctl -u survey-autodeploy). Sửa xong: xoá $STATE_DIR/skip-sha hoặc chạy deploy.sh tay"
  exit 1
fi
