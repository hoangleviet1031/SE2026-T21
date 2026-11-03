# BT3 VT-082: thông báo phiếu mới

Bài tập cá nhân 3, Đỗ Tùng Dương, 23001858. Nhánh `bt3/do-tung-duong-vt082-notify-new-record`, baseline `ef92b35`. **Không merge khi nhóm chưa review.**

Slice: server gửi thông báo `record.created` tới supervisor và Owner khi có phiếu mới, sau khi commit, qua hàng đợi có giới hạn. Kênh trong slice này ghi log (`logChannel`), chưa có nhà cung cấp thật hay UI. Xem [SPEC.md](SPEC.md).

Nhánh được đổi tên trước khi push để dễ phân biệt trong nhóm. Prompt và log tạo trước đó vẫn ghi tên cũ `bt3/vt082-notify-new-record` và `mutation/vt082-boundary-gte` (nay là `mutation/do-tung-duong-vt082-boundary-gte`); giữ nguyên vì đó là bản ghi lúc chạy.

## Chạy test

Cần Node 22.13 trở lên.

```bash
npm ci
npm run typecheck -w server
npm test -w server                       # toàn bộ test server
cd server
npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts   # riêng test của bài
```

## Tái lập thí nghiệm

Chạy từ gốc repo, working tree sạch.

```bash
# Test đỏ trước patch
git checkout a7bbec1 && (cd server && npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts); git checkout -

# Mutation bắt buộc (> thành >=): phải có test đỏ. Nhánh này không merge.
git apply docs/bt3-vt082/evidence/20-mutation-m1.diff
(cd server && npx vitest run test/notifications.test.ts); git checkout server/src/notifications.ts

# Cả bộ mutation, tự khôi phục file
python -X utf8 docs/bt3-vt082/run-mutations.py

# Flaky: đổi thứ tự, múi giờ, CPU bận (khoảng 20 phút)
bash docs/bt3-vt082/run-flaky.sh 20

# Coverage, không đổi package.json
npm i --no-save @vitest/coverage-v8@5.0.3
(cd server && npx vitest run test/notifications.test.ts test/notificationsRecords.test.ts --coverage --coverage.include=src/notifications.ts --coverage.reporter=text)

# Tải 120 PUT đồng thời, so p95 với 3,5 s. Đối chứng baseline cần worktree.
git worktree add .baseline ef92b35
cd server
npx tsx test/perf/notifyLoad.ts --sizes small,medium,large --rounds 3 --baseline-root ../.baseline
npx tsx test/perf/notifyLoad.ts --sizes s500k --modes good,baseline,baseline,good,good,baseline,baseline,good,good,baseline,baseline,good --rounds 3 --baseline-root ../.baseline   # ABBA, evidence/32
npx tsx test/perf/putCost.ts
```

## Tài liệu

| File | Nội dung |
|---|---|
| [SPEC.md](SPEC.md) | Problem statement, acceptance criteria, constraints, invariant |
| [PLAN-REVIEW.md](PLAN-REVIEW.md) | Review plan của AI bằng evidence |
| [TEST-REVIEW.md](TEST-REVIEW.md) | Test AI sinh: đã xoá, đã sửa, đã thêm |
| [ai-log/](ai-log/) | Prompt và output nguyên văn |
| [evidence/](evidence/) | Log đỏ, xanh, mutation, coverage, flaky, tải |
| [TRACEABILITY.md](TRACEABILITY.md) | TC → tên test → AC/Risk → mutation |
| [evidence/28-coverage-before-tc15.txt](evidence/28-coverage-before-tc15.txt) | Coverage trước khi có test biên id |
| [evidence/29-flaky-order-proof.txt](evidence/29-flaky-order-proof.txt) | Shuffle có đổi thứ tự test |
| [evidence/30-coverage-function-gap.txt](evidence/30-coverage-function-gap.txt) | Hàm làm coverage function còn 93,33% |
| [evidence/31-put-cost-recheck.jsonl](evidence/31-put-cost-recheck.jsonl) | Đo lại chi phí từng bước của PUT |
| [evidence/32-load-abba-500k.jsonl](evidence/32-load-abba-500k.jsonl), [cmd](evidence/32-load-abba-500k.cmd.txt) | 500 KB thứ tự ABBA, kèm điều kiện đo |
| [evidence/32b-load-abba-500k-idle.jsonl](evidence/32b-load-abba-500k-idle.jsonl), [cmd](evidence/32b-load-abba-500k-idle.cmd.txt) | Đo lại 500 KB trên máy rảnh hơn |
| [evidence/34-mutations-defaults-before.json](evidence/34-mutations-defaults-before.json) | M11–M13 sống sót trên 41 test |
| [evidence/35-mutations-all-after-defaults.json](evidence/35-mutations-all-after-defaults.json) | Cả 13 mutation sau khi thêm 3 test |
| [evidence/36-flaky-after-defaults.txt](evidence/36-flaky-after-defaults.txt) | Kiểm flaky lại với 44 test |
| [evidence/37-green-after-defaults.txt](evidence/37-green-after-defaults.txt) | `tsc` và 462/462 test server |
| [evidence/33-ci.txt](evidence/33-ci.txt) | CI của PR #123 trên Node 22 |
