#!/usr/bin/env bash
# Triển khai lại staging theo main mới nhất. Chạy trên máy staging:
#   ~/app/scripts/deploy.sh          # deploy tay: main mới nhất
#   ~/app/scripts/deploy.sh <sha>    # chỉ tới đúng commit này (auto-deploy.sh dùng)
# Các bước cài lần đầu và cách xử lý sự cố: docs/deploy.md
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/backup}"
DB_FILE=server/data/survey.db
KEEP_BACKUPS=7
API=http://localhost:3001
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.local/state/survey-deploy}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-$HOME/.survey-deploy.lock}"
target="${1:-}"

# Deploy tay và tự deploy không được chạy chồng. auto-deploy.sh đã giữ khoá này
# rồi mới gọi script, nên nó báo DEPLOY_LOCK_HELD=1 để không xin lại.
if [ "${DEPLOY_LOCK_HELD:-}" != 1 ]; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Đang có lần deploy khác chạy (có thể là tự deploy, xem journalctl -u survey-autodeploy). Thử lại sau." >&2
    exit 1
  fi
fi

if [ -n "$target" ] && ! [[ "$target" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Tham số phải là sha đủ 40 ký tự, nhận được: $target" >&2
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != main ]; then
  echo "Đang ở nhánh $branch. Staging chỉ chạy main." >&2
  exit 1
fi
# Sửa tay trên server sẽ bị lẫn vào bản chạy; dừng để người triển khai tự xem.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Có file đã sửa tay trong ~/app (git status). Xử lý xong rồi chạy lại." >&2
  exit 1
fi

before=$(git rev-parse --short HEAD)
echo "== Lấy code mới (đang ở $before)"
if [ -z "$target" ]; then
  git pull --ff-only
else
  # Chỉ tới đúng commit đã qua CI, không kéo thêm commit main mới hơn chưa kiểm.
  git fetch origin main
  if ! git merge-base --is-ancestor "$target" origin/main; then
    echo "Commit $target không nằm trên origin/main." >&2
    exit 1
  fi
  git merge --ff-only "$target"
fi

echo "== Cài thư viện, build client"
npm ci
npm run build

# Sao lưu trước khi khởi động lại vì bản mới có thể chạy migration (design §12).
if [ -f "$DB_FILE" ]; then
  echo "== Sao lưu CSDL"
  mkdir -p "$BACKUP_DIR"
  node --no-warnings scripts/backup-db.mjs "$DB_FILE" "$BACKUP_DIR/survey-$(date +%Y%m%d-%H%M%S)-$before.db"
  # Giữ $KEEP_BACKUPS bản mới nhất.
  ls -1t "$BACKUP_DIR"/survey-*.db | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
fi

echo "== Khởi động lại server"
sudo systemctl restart survey-api

# tsx cần vài giây để chạy; thử lại tối đa 30 giây.
for _ in $(seq 1 30); do
  if curl -fsS "$API/api/health" > /dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS "$API/api/health" > /dev/null; then
  echo "Server không trả lời /api/health. Xem: journalctl -u survey-api -n 50" >&2
  exit 1
fi

# Route tiêm lỗi không bao giờ được bật trên staging (TV1-01, design §9).
test_status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/__test/faults")
if [ "$test_status" != 404 ]; then
  echo "/api/__test/faults trả $test_status, phải là 404. Kiểm tra ENABLE_TEST_ROUTES trong survey-api.service." >&2
  exit 1
fi

# auto-deploy.sh so với file này để biết server đã chạy bản nào (HEAD có thể mới hơn
# bản đang chạy nếu lần trước hỏng sau bước pull).
mkdir -p "$STATE_DIR"
git rev-parse HEAD > "$STATE_DIR/deployed-sha"

echo "== Xong: $(git log --oneline -1)"
