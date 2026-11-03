# BT3 VT-082: thông báo phiếu mới

Bài tập cá nhân 3, Đỗ Tùng Dương, 23001858. Nhánh `bt3/vt082-notify-new-record`, baseline `ef92b35`. **Không merge khi nhóm chưa review.**

Slice: server gửi thông báo `record.created` tới supervisor và Owner khi có phiếu mới, sau khi commit, qua hàng đợi có giới hạn. Kênh trong slice này ghi log (`logChannel`), chưa có nhà cung cấp thật hay UI. Xem [SPEC.md](SPEC.md).

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
