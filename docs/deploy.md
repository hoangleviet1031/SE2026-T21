# Triển khai staging

Staging là bản chạy thật của `main` trên HTTPS, dùng để thử app trên điện thoại và demo cuối tuần. Ticket TV1-01, spec ở [design.md §12](design.md#12-triển-khai).

- **Địa chỉ:** https://se2026-t21.koreacentral.cloudapp.azure.com
- **Người quản lý:** Dương (giữ khoá SSH, tài khoản Azure)
- **Triển khai lại sau mỗi lần merge `main`:** SSH vào máy rồi chạy `~/app/scripts/deploy.sh` (mục [Triển khai lại](#triển-khai-lại-sau-mỗi-lần-merge-main))

## Chọn gì và vì sao

Chọn **máy ảo Azure for Students + Caddy**, tên miền miễn phí `*.cloudapp.azure.com` của Azure.

| Phương án | Vì sao không chọn |
|---|---|
| Cloudflare Tunnel từ máy nhóm | Bản nhanh (`trycloudflare.com`) đổi tên miền mỗi lần chạy → điện thoại mất app đã cài và IndexedDB (dữ liệu gắn với origin). Bản cố định cần tên miền riêng, và máy nhóm phải bật suốt |
| Render, Railway, Fly… gói miễn phí | Ổ đĩa không bền: khởi động lại là mất file SQLite |
| Oracle Cloud Always Free | Ổn, nhưng đăng ký cần thẻ và hay hết máy ARM; để làm dự phòng |

Azure for Students đăng ký bằng email trường, không cần thẻ, ổ đĩa bền, IP và tên miền cố định. Caddy tự xin và gia hạn chứng chỉ HTTPS (Let's Encrypt), cấu hình vài dòng.

## Máy chủ

| Mục | Giá trị |
|---|---|
| Tài khoản | Azure for Students (của Dương), resource group `se2026-staging` |
| Vùng | Korea Central |
| Cỡ máy | Standard_B2ats_v2 (2 vCPU, 1 GiB RAM, x64) + swap 2 GiB |
| Hệ điều hành | Ubuntu 24.04 LTS |
| Ổ đĩa | 64 GiB |
| Người dùng | `azureuser`, đăng nhập bằng khoá SSH `se2026-staging_key.pem` |
| IP tĩnh | 52.141.61.76 |
| Tên miền | `se2026-t21.koreacentral.cloudapp.azure.com` (Public IP → Configuration → DNS name label) |
| Cổng mở (NSG) | 22 (SSH), 80, 443. **Không** mở 3001 |

Theo dõi tiền đã dùng ở Azure Portal → Cost Management. Tắt máy khi không cần thì vẫn giữ ổ đĩa, nhưng staging sẽ không truy cập được.

### Vào máy

```powershell
ssh -i "$HOME\.ssh\se2026-staging_key.pem" azureuser@se2026-t21.koreacentral.cloudapp.azure.com
```

Khoá chỉ Dương giữ. Bạn khác cần vào máy thì gửi Dương **khoá công khai** (`~/.ssh/id_ed25519.pub`; chưa có thì tạo bằng `ssh-keygen -t ed25519`), Dương thêm một dòng vào `~/.ssh/authorized_keys` trên máy. Không gửi khoá bí mật qua chat.

## Cài lần đầu

Chỉ cần làm khi dựng máy mới. Các lệnh chạy trên máy staging (dấu nhắc `azureuser@se2026-staging:~$`); máy tải bằng mạng Azure.

### 1. Swap 2 GiB

Máy chỉ có 1 GiB RAM, `npm ci` + `npm run build` dễ bị hệ điều hành giết (in mỗi chữ `Killed`).

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # dòng Swap: 2.0Gi
```

### 2. Cập nhật Ubuntu

```bash
sudo apt update && sudo apt -y upgrade   # màn hình needrestart: Enter
sudo reboot                              # đợi 1 phút rồi SSH lại
```

### 3. Node 22

Cần Node ≥ 22.13 vì server dùng `node:sqlite`.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v   # v22.13 trở lên
```

Không cần nâng npm dù npm gợi ý; giữ bản đi kèm Node 22.

### 4. Caddy

Theo https://caddyserver.com/docs/install (gói apt chính thức):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
systemctl is-active caddy   # active
```

### 5. Lấy code và build

```bash
git clone https://github.com/hoangleviet1031/SE2026-T21.git ~/app
cd ~/app
npm ci
npm run build
ls client/dist   # index.html, sw.js, manifest.webmanifest, assets/
```

Repo public nên không cần token GitHub.

### 6. Chạy server bằng systemd

`/etc/systemd/system/survey-api.service`:

```ini
[Unit]
Description=Field Survey API
After=network.target

[Service]
User=azureuser
WorkingDirectory=/home/azureuser/app
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DB_PATH=data/survey.db
Environment=PUBLIC_BASE_URL=https://se2026-t21.koreacentral.cloudapp.azure.com
ExecStart=/usr/bin/npm run start -w server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now survey-api
curl -s http://localhost:3001/api/health   # {"ok":true}
```

- `npm run start -w server` chạy trong thư mục `server/`, nên CSDL nằm ở **`~/app/server/data/survey.db`**. `server/data/` có trong `.gitignore`, `git pull` không đụng tới.
- Server chạy bằng `tsx` (chưa có bản build JS), nên **không** cài bằng `npm ci --omit=dev`.
- Cố ý **không** đặt:
  - `ENABLE_TEST_ROUTES`: bật thì ai cũng gọi được `/api/__test/*` để tiêm lỗi (design §9).
  - `SEED_DEMO`: bật thì nạp tài khoản demo có token công khai trong repo, ai cũng đăng nhập được.
  - `CORS_ORIGIN`: client và API cùng origin qua Caddy, không cần CORS (design §12).

### 7. Caddy

`/etc/caddy/Caddyfile`:

```
se2026-t21.koreacentral.cloudapp.azure.com {
	handle /api/* {
		reverse_proxy localhost:3001
	}
	handle {
		root * /home/azureuser/app/client/dist
		try_files {path} /index.html
		file_server
	}
}
```

```bash
chmod o+x /home/azureuser   # Caddy chạy bằng user caddy, cần đi qua thư mục home để đọc client/dist
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy tự xin chứng chỉ trong vài chục giây đầu (cần cổng 80 và 443 mở) và tự chuyển `http://` sang `https://`.

## Triển khai lại sau mỗi lần merge `main`

```bash
ssh -i "$HOME\.ssh\se2026-staging_key.pem" azureuser@se2026-t21.koreacentral.cloudapp.azure.com
~/app/scripts/deploy.sh
```

[`scripts/deploy.sh`](../scripts/deploy.sh) làm lần lượt (khoảng 20 giây):

1. Dừng nếu không ở `main` hoặc có file sửa tay trong `~/app`.
2. `git pull --ff-only`, `npm ci`, `npm run build`.
3. Sao lưu CSDL vào `~/backup/survey-<ngày giờ>-<commit cũ>.db` (giữ 7 bản mới nhất), vì bản mới có thể chạy migration khi khởi động.
4. `sudo systemctl restart survey-api`, chờ `/api/health` trả lời (tối đa 30 giây).
5. Kiểm tra `/api/__test/faults` trả `404`.

Lỗi ở bước nào thì script dừng và in lý do. Lỗi trước bước 4 thì server chưa khởi động lại (API vẫn là bản cũ), nhưng nếu build đã xong thì `client/dist` đã là bản mới; sửa lỗi rồi chạy lại script.

Sau khi triển khai, điện thoại đã cài app nhận bản mới ở lần mở app kế tiếp có mạng: service worker đang để `registerType: 'autoUpdate'` nên tự tải bản mới và tải lại trang (TV1-07 sẽ đổi sang hỏi người dùng trước).

## Kiểm tra sau khi triển khai

Từ máy bất kỳ (PowerShell):

```powershell
curl.exe -s https://se2026-t21.koreacentral.cloudapp.azure.com/api/health
curl.exe -s -o NUL -w "%{http_code}`n" -X POST https://se2026-t21.koreacentral.cloudapp.azure.com/api/__test/faults
curl.exe -s -o NUL -w "%{http_code}`n" https://se2026-t21.koreacentral.cloudapp.azure.com/
curl.exe -s https://se2026-t21.koreacentral.cloudapp.azure.com/admin/ | Select-String -Pattern "<title>"
```

Đúng: `{"ok":true}`, `404`, `200`, `<title>Quản trị · Khảo sát thực địa</title>`. Dòng cuối ra `Khảo sát thực địa` (không có "Quản trị") nghĩa là Caddy đưa `/admin/` về trang PWA: kiểm `client/dist/admin/index.html` có trên máy chủ (build mới), rồi xem lại `try_files` ở mục 7 (TV1-16, design §12).

Trên điện thoại:

- **Android (Chrome):** mở địa chỉ staging → ⋮ → **Cài đặt và tạo lối tắt** → mở app "Khảo sát" một lần khi có mạng → bật chế độ máy bay → tắt hẳn app → mở lại: vẫn hiện màn hình nhập mã.
- **iPhone (Safari 16.4+, không dùng Chrome):** nút Chia sẻ → **Thêm vào MH chính**, rồi làm như trên. Icon có thể chỉ là chữ cái vì chưa có icon PNG (TV1-07).

## Tài khoản

> 🕘 **Mục này đang chuyển dần sang [ADR 0003](adr/0003-accounts-and-owner-role.md)** (tự tạo tài khoản bằng tên + mật khẩu, mở tổ chức qua admin duyệt, trang quản trị `/admin/`). TV2-14 đã có phía server (migration 4, `/api/auth/*`); app khảo sát vẫn đăng nhập bằng mã tới TV2-16, TV1-14; CLI theo tên đăng nhập ở TV3-12; chỉ định Owner ở TV2-15.

### Nâng cấp lên migration 4 (TV2-14)

Migration 4 chạy khi server khởi động lần đầu với bản mới. Nó **dừng và server không khởi động** nếu còn tài khoản admin là thành viên tổ chức nào (ADR 0003 §5); CSDL giữ nguyên ở `user_version = 3`.

1. **Trước khi chạy `deploy.sh`**, kiểm tra trên máy staging:
   ```bash
   cd ~/app && node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('server/data/survey.db',{readOnly:true});console.log(db.prepare('PRAGMA user_version').get(), db.prepare(\"SELECT u.id,u.name,m.project_id,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.is_admin=1\").all())"
   ```
   Kết quả danh sách khác `[]` thì xử lý từng dòng trước, theo một trong hai cách (không tự động, vì có thể làm tổ chức mất người quản lý):
   - bỏ cờ admin của tài khoản đó, giữ vai trò trong tổ chức, rồi tạo tài khoản admin riêng bằng `user:add --admin`:
     ```bash
     node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('server/data/survey.db').prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(process.argv[1])" <userId>
     ```
   - hoặc rút tài khoản admin khỏi tổ chức (chỉ khi tổ chức còn giám sát viên khác).
2. Chạy `deploy.sh`. Nếu bước 4 báo server không lên, xem lý do bằng `journalctl -u survey-api -n 50`: dòng `Migration 4 dừng` liệt kê `userId (tên) – projectId – vai trò` cần xử lý; làm như bước 1 rồi `sudo systemctl restart survey-api`.
3. Sau khi lên: mọi mã đăng nhập cũ vẫn dùng được (được chép thành phiên trong bảng `sessions`), tên đăng nhập của tài khoản cũ là `userId`, chưa có mật khẩu. **Mọi tổ chức cũ chưa có Owner**; giám sát viên vẫn làm việc bình thường. Admin chỉ định Owner bằng lệnh `curl` "Chỉ định Owner" ở mục API admin dưới đây.

`POST /api/auth/register` đã mở trên staging (tối đa 5 tài khoản/giờ/IP); app có màn hình Tạo tài khoản từ TV1-14.

### Sau khi deploy TV1-14 (bỏ màn hình nhập mã)

Từ TV1-14 app chỉ đăng nhập bằng tên + mật khẩu. Máy đang đăng nhập vẫn chạy (phiên còn hiệu lực), nhưng đăng xuất, bị thu hồi phiên hay dùng máy khác thì phải có mật khẩu. Tài khoản cũ (tạo trước migration 4) **chưa có mật khẩu**, nên sau khi deploy admin chạy cho từng tài khoản cũ còn dùng, rồi gửi mật khẩu tạm riêng cho từng người:

```bash
cd ~/app
npm run user:reset-password -w server -- --user u_ovwt7i59   # Dương (tài khoản thường)
npm run user:reset-password -w server -- --user u_s7yb7uhm   # Hoàng
npm run user:reset-password -w server -- --user u_c0w5n6eh   # Đại
npm run user:reset-password -w server -- --user u_q6ylmk6e   # Dương admin (đăng nhập curl và trang /admin/)
```

Người dùng đăng nhập bằng tên `u_xxxxxxxx` và mật khẩu tạm. Lệnh không thu hồi phiên đang có. Đây là thao tác đổi dữ liệu staging: người chạy deploy hỏi Dương trước khi chạy.

### Tài khoản bằng CLI (TV3-12)

**Không chỉ định tài khoản admin làm thành viên tổ chức nào** (kể cả chính mình). Muốn thử app khảo sát thì tạo thêm một tài khoản thường.

Quản trị chạy lệnh trên máy staging, trong `~/app`; mật khẩu tạm in ra **một lần**, gửi cho người dùng qua kênh riêng. Lệnh mở cùng file `server/data/survey.db` với server, chạy được khi server đang chạy.

```bash
cd ~/app
npm run user:add -w server -- --username duong --name "Dương" --admin  # admin; in mật khẩu tạm và userId
npm run user:add -w server -- --username lan --name "Lan"              # người dùng thường
npm run user:reset-password -w server -- --user lan                   # quên mật khẩu (tài khoản cũ chưa có mật khẩu cũng dùng lệnh này)
npm run user:revoke-sessions -w server -- --user lan                  # mất máy: thu hồi mọi phiên
npm run user:disable -w server -- --user lan                          # khoá tài khoản và thu hồi mọi phiên
```

`user:rotate-token` đã bỏ. Tài khoản cũ (tạo trước migration 4) có tên đăng nhập là `userId`, nên `--user u_xxxxxxxx` vẫn dùng được.

**Lấy token để gọi API bằng `curl`**: mỗi lần đăng nhập tạo một phiên mới, `token` trong kết quả dùng làm `Authorization: Bearer`. App không nhập token nữa (TV1-14), đăng nhập trên app bằng tên + mật khẩu.

```bash
curl -s -X POST https://se2026-t21.koreacentral.cloudapp.azure.com/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"lan","password":"<mật khẩu>"}'
```

`seed:demo` **từ chối chạy** vì `NODE_ENV=production` là đúng: mật khẩu và token demo công khai trong repo. Không lách bằng cách bỏ `NODE_ENV`.

**API admin** (design §7, TV2-15), gọi với token admin (lấy bằng lệnh `curl` đăng nhập ở trên). Trang quản trị `/admin/` (TV1-16) mới có đăng nhập, chưa có A1, A2: tới khi có thì dùng các lệnh này. Admin **không tạo tổ chức trực tiếp** nữa: người dùng gửi yêu cầu mở tổ chức, admin duyệt, người gửi thành Owner.

```bash
TOKEN=<token admin>
API=https://se2026-t21.koreacentral.cloudapp.azure.com/api
# Yêu cầu đang chờ duyệt:
curl -s "$API/admin/project-requests" -H "Authorization: Bearer $TOKEN"
# Duyệt (trả projectId của tổ chức mới) hoặc từ chối kèm lý do:
curl -s -X POST "$API/admin/project-requests/<id yêu cầu>" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"decision":"approve"}'
curl -s -X POST "$API/admin/project-requests/<id yêu cầu>" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"decision":"reject","reason":"<lý do>"}'
# Danh sách tổ chức (tên đăng nhập Owner, số thành viên):
curl -s "$API/admin/projects" -H "Authorization: Bearer $TOKEN"
# Chỉ định Owner (tổ chức cũ chưa có Owner, hoặc khách hàng mất tài khoản Owner):
curl -s -X PUT "$API/admin/projects/demo-yte/owners/<tên đăng nhập>" -H "Authorization: Bearer $TOKEN"
# Khoá / mở tổ chức:
curl -s -X PATCH "$API/admin/projects/demo-yte" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"archived":true}'
```

Dự án `demo-yte` (có form mẫu) được server tạo sẵn khi khởi động. Admin không thành thành viên của tổ chức nào, kể cả tổ chức mình duyệt. Owner và supervisor thêm người vào tổ chức bằng tên đăng nhập ở màn hình Thành viên.

## Sao lưu và khôi phục

- `deploy.sh` tự sao lưu trước mỗi lần khởi động lại, vào `~/backup/`, giữ 7 bản.
- Sao lưu tay bất cứ lúc nào:
  ```bash
  cd ~/app && node --no-warnings scripts/backup-db.mjs server/data/survey.db ~/backup/survey-$(date +%Y%m%d-%H%M%S)-tay.db
  ```
  Script dùng `VACUUM INTO` qua `node:sqlite` (máy không cài `sqlite3`) và kiểm tra toàn vẹn bản sao.
- Khôi phục:
  ```bash
  sudo systemctl stop survey-api
  cd ~/app/server/data
  mkdir -p ~/backup/hong && mv survey.db* ~/backup/hong/   # giữ bản đang hỏng, không xoá
  cp ~/backup/<bản cần khôi phục>.db survey.db
  sudo systemctl start survey-api
  ```

## Xem log, xử lý sự cố

| Triệu chứng | Lệnh xem |
|---|---|
| API lỗi, trang báo mất kết nối | `journalctl -u survey-api -n 50 --no-pager` |
| HTTPS lỗi, chứng chỉ | `journalctl -u caddy -n 50 --no-pager` |
| Trạng thái hai dịch vụ | `systemctl status survey-api caddy` |
| Build bị `Killed` | `free -h`, kiểm tra swap còn bật |
| Khởi động lại tay | `sudo systemctl restart survey-api` / `sudo systemctl reload caddy` |

Dòng `ExperimentalWarning: SQLite is an experimental feature` trong log là bình thường.

## Việc chưa làm

- **Sao lưu hằng ngày** (design §12): hiện chỉ sao lưu khi triển khai lại. Muốn đủ thì thêm cron gọi `scripts/backup-db.mjs` mỗi ngày.
- **Ảnh:** khi có upload (TV3-05), đặt `UPLOAD_DIR` ra ngoài repo (vd. `/home/azureuser/survey-data/uploads`) và sao lưu cùng CSDL. `server/uploads/` (mặc định khi không đặt `UPLOAD_DIR`) đã có trong `.gitignore`.
- **Icon PNG 192/512** cho iOS và Android cũ: TV1-07.
