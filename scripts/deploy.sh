#!/usr/bin/env bash
# Triển khai lại staging theo main mới nhất. Chạy trên máy staging:
#   ~/app/scripts/deploy.sh
# Các bước cài lần đầu và cách xử lý sự cố: docs/deploy.md
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/backup}"
DB_FILE=server/data/survey.db
KEEP_BACKUPS=7
API=http://localhost:3001

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
git pull --ff-only

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

echo "== Xong: $(git log --oneline -1)"
