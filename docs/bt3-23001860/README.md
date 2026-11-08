# BT cá nhân 3 · 23001860 Hoàng Trọng Đại · VT-083

Change request: endpoint xuất dữ liệu, chỉ người có quyền tải được, dữ liệu đúng phạm vi.
Slice đã làm: `GET /api/projects/:projectId/export?format=json&includeDeleted=0` xuất JSON **cả dự án** (`{ forms, records }`), chỉ supervisor/owner, lọc theo `ctx.projectId`, form và phiếu đọc trong một transaction đọc (`readTx`). Spec: [design.md §4.6](../design.md#46-export).

- Baseline: `229f194` (main, merge PR #129). Nhánh: `bt3/hoang-trong-dai-vt083-export`. **Không merge khi nhóm chưa review.**
- Báo cáo: `BT3_23001860_VT-083.pdf` (nộp trên Classroom).

## Chạy test

Node ≥ 22.13, ở thư mục gốc repo:

```bash
npm install
npm run typecheck
npm test -w server                                                    # cả bộ server (434 test)
cd server
npx vitest run test/exportProject.test.ts test/exportConcurrency.test.ts   # 16 ca EX-01..EX-16
```

| Ca | File | Nội dung |
|---|---|---|
| EX-01..EX-05 | `server/test/exportProject.test.ts` | Thành công, `includeDeleted`, owner, contract với CSDL thật, cách ly dự án |
| EX-06..EX-10 | `server/test/exportProject.test.ts` | 403 `forbidden` / `not_member`, 401, 400 `invalid_body`, route theo form không đổi |
| EX-11..EX-14 | `server/test/exportConcurrency.test.ts` | Đồng thời 60 tác vụ: trộn người gọi, ghi + xuất xen nhau, hạ vai trò giữa chừng, kết nối CSDL thứ hai ghi xen giữa hai câu đọc |
| EX-15 | `server/test/exportProject.test.ts` | Lọc phạm vi surveyor ở hàm đọc (thêm sau khi mutation M3 sống sót) |
| EX-16 | `server/test/exportProject.test.ts` | Đường lỗi: dòng phiếu hỏng → 500, `readTx` ROLLBACK, server ghi tiếp được |

## Tái lập evidence

Log đã chạy nằm trong [evidence/](evidence/).

**Test đỏ trước khi sửa** (giữ test mới, lấy mã nguồn server của baseline):

```bash
git restore --source=229f194 -- server/src
(cd server && npx vitest run test/exportProject.test.ts test/exportConcurrency.test.ts)   # 12 fail, 4 pass
git restore --source=HEAD -- server/src
```

4 ca xanh ngay trên baseline (EX-06, 07, 08, 10) là test đặc tả: middleware quyền chạy trước router nên đã đúng từ trước.

**Mutation** (mỗi file `.patch` là một commit tạm, không có trong nhánh này):

```bash
git apply docs/bt3-23001860/evidence/mutations/M1.patch
(cd server && npx vitest run)        # phải có test đỏ
git checkout -- server/src
```

| | Mutation | Kết quả |
|---|---|---|
| M1 | Bỏ kiểm tra vai trò của export (`requireMember('supervisor')` → `'surveyor'`) | Bị bắt: 5 test |
| M2 | Bỏ validate `format` | Bị bắt: EX-09 |
| M3 | Bỏ lọc `created_by` (phạm vi surveyor) ở `listRecordsByProject` | **Sống sót**, thêm EX-15 thì bị bắt |
| M4 | Bỏ `readTx` | Bị bắt: chỉ EX-14 |
| M5 | Bỏ lọc `project_id` | Bị bắt: 5 test |
| M6 | Bỏ `ROLLBACK` trong `readTx` | Bị bắt: EX-16 |

**Coverage** (`@vitest/coverage-v8` không có trong `package.json`; cài tạm, không lưu):

```bash
npm install --no-save @vitest/coverage-v8@5.0.3 -w server
cd server && npx vitest run --coverage --coverage.include=src/routes/export.ts --coverage.include=src/repo/records.ts --coverage.include=src/repo/forms.ts --coverage.include=src/db.ts --coverage.include='src/lib/**'
```

**Flaky:** chạy 20 lần với thứ tự test xáo trộn, `--sequence.shuffle --sequence.seed=<1..20>` ([05-flaky.txt](evidence/05-flaky.txt)); 4 tiến trình song song × 5 vòng ([06-stress.txt](evidence/06-stress.txt)).

**Tải** (60 tác vụ cùng lúc, mục tiêu p95 ≤ 2,0 s; server ở tiến trình riêng, CSDL file tạm):

```bash
cd server
npx tsx test/load/exportLoad.ts --mode project --records 2000          # project | form | mixed
```

Kết quả (máy i7-1065G7, 32 GB, Windows 11, Node 24; 5 vòng × 60 request, lặp 3 lần): 500 phiếu p95 0,47–0,56 s (đạt). 2.000 phiếu p95 2,42–2,50 s (**chưa đạt**). 5.000 phiếu p95 5,8–6,3 s. Tải trộn 30 xuất + 30 ghi với 2.000 phiếu: p95 0,86–0,89 s. Một request đơn lẻ 2.000 phiếu: p95 44 ms. Số liệu ở [evidence/load/](evidence/load/).
