"""Mutation thủ công cho VT-082: sửa một chỗ, chạy test thông báo, khôi phục. Không commit gì.

Chạy từ gốc repo, working tree sạch: python -X utf8 docs/bt3-vt082/run-mutations.py [--only M1,M2] [--out file]
"""
import argparse
import json
import os
import re
import subprocess
import sys

NOTIFY = 'server/src/notifications.ts'
ROUTE = 'server/src/routes/records.ts'
REPO = 'server/src/repo/memberships.ts'
TESTS = ['test/notifications.test.ts', 'test/notificationsRecords.test.ts']

# (mã, file, chuỗi gốc, chuỗi đột biến, mô tả)
MUTATIONS = [
    ('M1', NOTIFY, 'queue.length + 1 > capacity', 'queue.length + 1 >= capacity', 'Bắt buộc VT-082: biên sức chứa hàng đợi, > thành >='),
    ('M2', NOTIFY, 'event.formId.length > MAX_ID_CHARS', 'event.formId.length >= MAX_ID_CHARS', 'Bắt buộc VT-082: biên độ dài formId, > thành >='),
    ('M3', NOTIFY, 'event.recordId.length > MAX_ID_CHARS', 'event.recordId.length >= MAX_ID_CHARS', 'Bắt buộc VT-082: biên độ dài recordId, > thành >='),
    ('M4', ROUTE, 'const created = saved.deleted\n    ? undefined\n    : {', 'const created = false\n    ? undefined\n    : {', 'Báo cả phiếu tạo đã xoá'),
    ('M5', NOTIFY, 'errorName: err instanceof Error ? err.name : undefined,', "errorName: err instanceof Error ? err.message : undefined,", 'Ghi err.message vào log (S3 phải bắt)'),
    ('M6', ROUTE, 'if (result.created) {', 'if (result.status === 201) {\n      result.created ??= { recordId: req.params.id, formId: \'\', formVersion: 0, createdAt: \'\' };', 'Dựa vào status 201: replay báo lại'),
    ('M7', REPO, "m.project_id = ? AND m.role IN ('supervisor', 'owner')", "m.project_id <> ? AND m.role IN ('supervisor', 'owner')", 'Người nhận lấy từ dự án khác (AC5)'),
    ('M8', REPO, "AND u.disabled = 0 AND m.user_id <> ?", "AND m.user_id <> ?", 'Gửi cho tài khoản bị khoá'),
    ('M9', NOTIFY, 'await Promise.race([channel.send(notification, controller.signal), deadline]);', 'await channel.send(notification, controller.signal);', 'Bỏ timeout: kênh treo giữ chỗ mãi'),
    ('M10', ROUTE, 'logFailure(\'notifier_error\', { projectId: ctx.projectId, recordId: req.params.id }, err);', 'throw err;', 'Bỏ chốt chặn ở route'),
]


def read(path):
    with open(path, encoding='utf8', newline='') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf8', newline='') as f:
        f.write(text)


def run_tests():
    env = {**os.environ, 'NO_COLOR': '1'}
    out = subprocess.run(
        ['npx', 'vitest', 'run', *TESTS, '--reporter=dot'],
        cwd='server', env=env, capture_output=True, text=True, encoding='utf8', errors='replace', shell=os.name == 'nt',
    )
    text = out.stdout + out.stderr
    fails = re.findall(r'^ FAIL\s+(.+)$', text, re.M)
    summary = re.search(r'Tests\s+(.+)', text)
    return {'exit': out.returncode, 'summary': summary.group(1).strip() if summary else '?', 'killedBy': fails[:6], 'killedCount': len(fails)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only')
    ap.add_argument('--out')
    args = ap.parse_args()
    only = set(args.only.split(',')) if args.only else None
    results = []
    for code, path, old, new, desc in MUTATIONS:
        if only and code not in only:
            continue
        original = read(path)
        normalized = original.replace('\r\n', '\n')
        if old not in normalized:
            sys.exit(f'{code}: không thấy chuỗi gốc trong {path}')
        write(path, normalized.replace(old, new, 1))
        try:
            result = run_tests()
        finally:
            write(path, original)
        result = {'id': code, 'file': path, 'desc': desc, 'status': 'KILLED' if result['exit'] != 0 else 'SURVIVED', **result}
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    if args.out:
        with open(args.out, 'w', encoding='utf8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
            f.write('\n')


if __name__ == '__main__':
    main()
