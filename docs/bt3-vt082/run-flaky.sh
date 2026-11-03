#!/bin/bash
# Kiểm flaky cho test thông báo. Chạy từ gốc repo: bash docs/bt3-vt082/run-flaky.sh [số lần]. Không có retry.
# A: đổi thứ tự (order/shared state). B: múi giờ (time). C: CPU bận (time/concurrency: timeout thật, vi.waitFor).
N=${1:-20}
cd server || exit 1
TESTS="test/notifications.test.ts test/notificationsRecords.test.ts"

once() { # nhãn, biến môi trường, tham số vitest
  label=$1; shift
  # Không thấy dòng tổng kết cũng tính FAIL: vitest lỗi cờ hay crash không được coi là pass.
  line=$(NO_COLOR=1 env "$@" 2>&1 | grep -E 'Tests  ')
  case "$line" in
    *failed*|"") echo "$label FAIL $line" ;;
    *) echo "$label pass $line" ;;
  esac
}

echo "== A. thứ tự ngẫu nhiên, $N seed"
for seed in $(seq 1 "$N"); do
  once "seed=$seed" npx vitest run $TESTS --sequence.shuffle.tests --sequence.shuffle.files --sequence.seed="$seed" --reporter=dot
done

echo "== B. múi giờ"
for tz in UTC Asia/Ho_Chi_Minh America/Los_Angeles; do
  once "TZ=$tz" TZ=$tz npx vitest run $TESTS --reporter=dot
done

echo "== C. CPU bận: $(nproc) tiến trình quay vòng, $N lần"
pids=()
for _ in $(seq 1 "$(nproc)"); do
  node -e "const end = Date.now() + 1800000; while (Date.now() < end);" &
  pids+=($!)
done
for i in $(seq 1 "$N"); do
  once "busy=$i" npx vitest run $TESTS --reporter=dot
done
kill "${pids[@]}" 2>/dev/null
