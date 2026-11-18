# Triển khai staging

Staging là bản chạy thật của `main` trên HTTPS, dùng để thử app trên điện thoại và demo cuối kỳ. Ticket TV1-01, spec ở [design.md §12](design.md#12-triển-khai).

- **Địa chỉ:** https://se2026-t21.koreacentral.cloudapp.azure.com
- **Người quản lý:** Dương (giữ khoá SSH, tài khoản Azure)
- **Triển khai lại sau mỗi lần merge `main`:** tự động. Timer trên máy staging thấy `main` có commit mới mà CI đã xanh thì tự chạy `deploy.sh` (mục [Tự deploy](#tự-deploy-sau-mỗi-lần-merge-main)). Deploy tay vẫn dùng được (mục [Deploy tay](#deploy-tay))

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
Environment=UPLOAD_DIR=/home/azureuser/survey-data/uploads
Environment=PUBLIC_BASE_URL=https://se2026-t21.koreacentral.cloudapp.azure.com
ExecStart=/usr/bin/npm run start -w server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
mkdir -p ~/survey-data/uploads
sudo systemctl daemon-reload
sudo systemctl enable --now survey-api
curl -s http://localhost:3001/api/health   # {"ok":true}
```

- `npm run start -w server` chạy trong thư mục `server/`, nên CSDL nằm ở **`~/app/server/data/survey.db`**. `server/data/` có trong `.gitignore`, `git pull` không đụng tới.
- Ảnh nằm ở **`~/survey-data/uploads`**, ngoài repo, để xoá hay clone lại `~/app` không mất ảnh (TV3-13). Không đặt `UPLOAD_DIR` thì server ghi vào `~/app/server/uploads`. Máy cài trước TV3-13 làm theo mục [Chuyển ảnh ra ngoài repo](#chuyển-ảnh-ra-ngoài-repo-một-lần).
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
	# Trang quản trị (TV1-16): try_files bên dưới đưa /admin/ về index.html của PWA
	redir /admin /admin/ 308
	handle /admin/* {
		root * /home/azureuser/app/client/dist
		file_server
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

## Tự deploy sau mỗi lần merge `main`

Timer `survey-autodeploy` trên máy staging chạy [`scripts/auto-deploy.sh`](../scripts/auto-deploy.sh) 2 phút một lần (tính từ lúc lần trước chạy xong). Mọi commit trên `main` có CI xanh đều tự lên staging, không ai phải SSH (Dương chốt 2026-11-18). Từ lúc merge tới lúc staging chạy bản mới mất khoảng thời gian chạy CI cộng tối đa 2 phút.

Chọn cách máy staging tự kéo thay vì để GitHub Actions SSH vào máy: repo là repo cá nhân của Hoàng, người khác không đặt được secret chứa khoá SSH, cũng không đăng ký được runner riêng. Máy staging chỉ đọc API công khai của GitHub, không cần token.

Mỗi lần chạy, script:

1. Lấy khoá chung `~/.survey-deploy.lock` (`flock`, không chờ). Deploy tay đang chạy thì nhường, lần sau thử lại.
2. Bỏ qua nếu `~/app` không ở `main` (đang [quay lại bản trước](#quay-lại-bản-trước)).
3. `git fetch origin main`. `origin/main` trùng bản đã deploy thành công gần nhất (`~/.local/state/survey-deploy/deployed-sha`, do `deploy.sh` ghi) thì thôi. So với file này chứ không so `HEAD`, vì `deploy.sh` có thể đã pull xong rồi mới hỏng lúc khởi động lại.
4. Bỏ qua nếu commit đó có trong `~/.local/state/survey-deploy/skip-sha` (đã biết CI không xanh hoặc deploy hỏng), để không thử lại mỗi 2 phút.
5. Hỏi API GitHub lượt chạy workflow CI (event `push`, nhánh `main`) của đúng commit đó. Chưa có lượt hoặc chưa xong thì lần sau hỏi lại. Xong mà không xanh thì ghi `skip-sha`. Không hỏi được GitHub (mạng lỗi, hết 60 lần/giờ) thì ghi log và lần sau hỏi lại. Chỉ gọi API khi có commit mới, mỗi commit vài lần trong lúc chờ CI.
6. CI xanh thì chạy `deploy.sh <sha>`: chỉ fast-forward tới đúng commit đó, kể cả khi `main` đã có thêm commit chưa qua CI (commit sau sẽ được deploy khi CI của nó xanh). Hỏng thì ghi `skip-sha` và unit báo lỗi.

CI trên `main` huỷ lượt cũ khi có push mới (`cancel-in-progress` ở `ci.yml`). Hai lần merge sát nhau thì commit cũ ra `cancelled`, nhưng lúc đó `origin/main` đã là commit mới nên script chờ CI của commit mới rồi deploy commit mới; commit cũ không được deploy riêng, và không cần.

**Mọi kết quả nằm ở journal**, mỗi lần deploy có một dòng `auto-deploy: deploy <sha> xong (CI run <id>)` hoặc `auto-deploy: deploy <sha> HỎNG`:

```bash
journalctl -u survey-autodeploy --since today --no-pager      # các lần kiểm và deploy hôm nay
journalctl -u survey-autodeploy -o cat --no-pager | grep -E 'deploy [0-9a-f]{7} (xong|HỎNG)' | tail   # lịch sử deploy
systemctl list-timers survey-autodeploy                       # lần chạy kế tiếp
cat ~/.local/state/survey-deploy/deployed-sha ~/.local/state/survey-deploy/skip-sha
```

Kết quả không đẩy lên GitHub (commit status, Deployments): việc đó cần token có quyền ghi vào repo của Hoàng, mà token cá nhân dạng classic có quyền trên mọi repo của người tạo, để trên máy ảo thì lộ máy là lộ hết. Vì vậy deploy hỏng chỉ thấy ở journal và `systemctl --failed` (tới lần chạy kế tiếp); xem journal sau mỗi lần merge.

**Deploy hỏng:** đọc các dòng ngay trên dòng `HỎNG` (cùng thông báo như khi chạy `deploy.sh` tay), sửa theo mục [Deploy tay](#deploy-tay). Sửa trên `main` thì commit mới tự deploy. Không cần sửa code (vd. lỗi mạng lúc `npm ci`) thì chạy `~/app/scripts/deploy.sh` tay, hoặc `rm ~/.local/state/survey-deploy/skip-sha` để timer thử lại. Script không tự quay lại bản trước; quay lại làm tay theo [mục dưới](#quay-lại-bản-trước).

### Cài timer (một lần)

File unit nằm trong repo: [`scripts/systemd/survey-autodeploy.service`](../scripts/systemd/survey-autodeploy.service), [`scripts/systemd/survey-autodeploy.timer`](../scripts/systemd/survey-autodeploy.timer). Chạy trên máy staging, sau khi `main` đã có các file này:

```bash
~/app/scripts/deploy.sh                       # deploy tay một lần: lấy script mới (xem ghi chú dưới về deployed-sha)
AUTO_DEPLOY_DRY_RUN=1 ~/app/scripts/auto-deploy.sh   # chạy thử, không deploy; phải ra "[thử] đã chạy bản mới nhất <commit đang chạy>"
sudo install -m 644 ~/app/scripts/systemd/survey-autodeploy.service ~/app/scripts/systemd/survey-autodeploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now survey-autodeploy.timer
sudo systemctl start survey-autodeploy        # chạy một lần ngay
journalctl -u survey-autodeploy -n 5 --no-pager   # không có dòng lỗi
systemctl list-timers survey-autodeploy       # cột NEXT trong vòng 2 phút
```

Lần deploy tay đầu tiên sau khi merge #146 **chưa tạo** `~/.local/state/survey-deploy/deployed-sha`: bash đã nạp bản `deploy.sh` cũ trước khi `git pull` thay file, nên chạy hết bản cũ, chưa có bước ghi file này (staging 2026-11-18, 8161223). Không sao: chưa có file thì `auto-deploy.sh` lấy `HEAD` làm bản đã deploy. File được tạo từ lần deploy kế tiếp, tay hay tự động.

Sau đó kiểm ở lần merge `main` kế tiếp: `journalctl -u survey-autodeploy -f` thấy "CI của … chưa xong" rồi "deploy … xong", `git -C ~/app log --oneline -1` đúng commit đó, rồi kiểm như mục [Kiểm tra sau khi triển khai](#kiểm-tra-sau-khi-triển-khai).

Sửa file unit trong repo thì chạy lại dòng `sudo install` và `sudo systemctl daemon-reload`; timer không tự cài lại unit.

### Tạm dừng, gỡ

Chỉ dùng một cách tạm dừng là dừng timer:

```bash
sudo systemctl stop survey-autodeploy.timer    # tạm dừng tới lần khởi động lại máy
sudo systemctl disable --now survey-autodeploy.timer   # tạm dừng cả qua khởi động lại
sudo systemctl enable --now survey-autodeploy.timer    # chạy lại
```

Dừng timer khi:
- **Sắp merge PR có migration kèm điều kiện dừng** (vd. [migration 4](#nâng-cấp-lên-migration-4-tv2-14)): dừng timer trước khi merge, kiểm điều kiện, deploy tay, rồi chạy lại timer. Không dừng thì bản mới tự lên và migration chạy ngay khi CI xanh.
- **Quay lại bản trước** (mục dưới).

Gỡ hẳn (deploy tay vẫn dùng được như trước):

```bash
sudo systemctl disable --now survey-autodeploy.timer
sudo rm /etc/systemd/system/survey-autodeploy.service /etc/systemd/system/survey-autodeploy.timer
sudo systemctl daemon-reload
```

## Deploy tay

Dùng khi timer đang dừng hoặc chưa cài, khi vừa sửa lỗi lúc deploy, hoặc để thử lại nhanh.

```bash
ssh -i "$HOME\.ssh\se2026-staging_key.pem" azureuser@se2026-t21.koreacentral.cloudapp.azure.com
~/app/scripts/deploy.sh
```

[`scripts/deploy.sh`](../scripts/deploy.sh) làm lần lượt (khoảng 20 giây):

1. Dừng nếu đang có lần deploy khác chạy (cùng khoá với tự deploy, báo ngay chứ không chờ), không ở `main`, hoặc có file sửa tay trong `~/app`.
2. `git pull --ff-only` (có tham số `<sha>` thì chỉ fast-forward tới commit đó, phải nằm trên `origin/main`; tự deploy dùng cách này), `npm ci`, `npm run build`.
3. Sao lưu CSDL vào `~/backup/survey-<ngày giờ>-<commit cũ>.db` (giữ 7 bản mới nhất), vì bản mới có thể chạy migration khi khởi động.
4. `sudo systemctl restart survey-api`, chờ `/api/health` trả lời (tối đa 30 giây).
5. Kiểm tra `/api/__test/faults` trả `404`, rồi ghi commit đang chạy vào `~/.local/state/survey-deploy/deployed-sha` để tự deploy biết bản này đã lên.

Lỗi ở bước nào thì script dừng và in lý do. Lỗi trước bước 4 thì server chưa khởi động lại (API vẫn là bản cũ), nhưng nếu build đã xong thì `client/dist` đã là bản mới; sửa lỗi rồi chạy lại script.

Sau khi triển khai, điện thoại đã cài app thấy dải "Có phiên bản mới" ở lần mở app kế tiếp có mạng (hoặc trong vòng 60 phút nếu app đang mở); bản mới chỉ chạy khi người dùng bấm [Tải lại] (`registerType: 'prompt'`, TV1-07, design §4.3).

## Kiểm tra sau khi triển khai

Từ máy bất kỳ (PowerShell):

```powershell
curl.exe -s https://se2026-t21.koreacentral.cloudapp.azure.com/api/health
curl.exe -s -o NUL -w "%{http_code}`n" -X POST https://se2026-t21.koreacentral.cloudapp.azure.com/api/__test/faults
curl.exe -s -o NUL -w "%{http_code}`n" https://se2026-t21.koreacentral.cloudapp.azure.com/
curl.exe -s https://se2026-t21.koreacentral.cloudapp.azure.com/admin/ | Select-String -Pattern "<title>"
```

Đúng: `{"ok":true}`, `404`, `200`, `<title>Quản trị · Khảo sát thực địa</title>`. Dòng cuối ra `Khảo sát thực địa` (không có "Quản trị") nghĩa là Caddy đưa `/admin/` về trang PWA: kiểm `client/dist/admin/index.html` có trên máy chủ (build mới) và Caddyfile có khối `handle /admin/*` ở mục 7 (TV1-16, design §12). `curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" .../admin` phải ra `308 .../admin/`.

Trên điện thoại:

- **Android (Chrome):** mở địa chỉ staging → ⋮ → **Cài đặt và tạo lối tắt** → mở app "Khảo sát" một lần khi có mạng → bật chế độ máy bay → tắt hẳn app → mở lại: vẫn hiện app (màn hình Đăng nhập, hoặc trang chủ nếu đã đăng nhập).
- **iPhone (Safari 16.4+, không dùng Chrome):** nút Chia sẻ → **Thêm vào MH chính**, rồi làm như trên.

**Tín hiệu cần xem trong 15 phút sau deploy** (trên máy staging):

```bash
journalctl -u survey-api --since "15 min ago" --no-pager | grep -iE "error|lỗi" | tail -20
systemctl status survey-api --no-pager | head -5   # active (running), không restart liên tục
```

Có lỗi lặp lại, server tự khởi động lại nhiều lần, hoặc một thành viên báo không đồng bộ được trên điện thoại thì xem mục dưới. Server chưa có log theo request ([tech-debt.md](tech-debt.md) N1), nên hiện chỉ thấy lỗi server ném ra, không thấy tỉ lệ request lỗi.

## Quay lại bản trước

Dùng khi bản vừa deploy làm hỏng việc chính (đăng nhập, lưu hay đồng bộ phiếu) mà không sửa nhanh được. `deploy.sh` chỉ chạy trên `main`, nên quay lại làm tay. Diễn tập lần đầu 2026-10-22 (8d93233 → f5dba4f, nhánh 2a): quay lại mất 19 giây, quay về `main` bằng `deploy.sh` mất 21 giây, phần lớn là `npm ci` và build (design §11.4 QS5).

**0. Dừng tự deploy:** `sudo systemctl stop survey-autodeploy.timer`. Khi `~/app` đang ở HEAD detached thì timer cũng tự bỏ qua, nhưng dừng hẳn thì không có lần nào chạy chen vào giữa các bước dưới. Quay về `main` xong (cuối mục) thì `sudo systemctl start survey-autodeploy.timer`.

**1. Xem bản mới có nâng CSDL không.** Tên file sao lưu cuối cùng có commit cũ: `ls -1t ~/backup | head -1` → `survey-<ngày giờ>-<commit cũ>.db`. So `user_version` của file đó với CSDL đang chạy (lệnh `node -e` ở mục "Nâng cấp lên migration 4", đổi đường dẫn file).

**2a. `user_version` không đổi: chỉ quay code, không mất dữ liệu.**

```bash
cd ~/app
git checkout --detach <commit cũ>
npm ci && npm run build
sudo systemctl restart survey-api
# tsx cần vài giây mới mở cổng 3001: gọi ngay sau restart sẽ lỗi "Couldn't connect", nên chờ tối đa 30 giây
for i in $(seq 1 30); do curl -fsS http://localhost:3001/api/health && break; sleep 1; done
```

Sau 30 giây vẫn chưa ra `{"ok":true}` thì xem `journalctl -u survey-api -n 50`. Kiểm như mục "Kiểm tra sau khi triển khai". Sửa xong trên `main` thì quay về:

```bash
cd ~/app
git switch main            # deploy.sh từ chối chạy khi đang detached HEAD
~/app/scripts/deploy.sh
```

Bản sao lưu lần này mang tên commit của `main` (vd. `survey-…-<commit mới>.db`) dù server đang chạy commit cũ, vì `deploy.sh` đặt tên theo `HEAD` lúc chạy.

**2b. `user_version` đã tăng: ưu tiên sửa tiến** (vá trên `main` rồi deploy lại), không quay lại. Code cũ từ chối mở CSDL mới hơn nó (`migrate` trong `server/src/db.ts` báo "CSDL ở phiên bản …, mới hơn mã nguồn"), nên muốn chạy code cũ thì phải khôi phục bản sao lưu ở mục "Sao lưu và khôi phục", và:
- **Mất mọi phiếu, ảnh, tài khoản server đã nhận từ lúc deploy.** Điện thoại đã nhận `200` thì đã xoá op, sẽ không gửi lại.
- **Bộ đếm `seq` lùi lại**, trong khi điện thoại đã lưu cursor lớn hơn, nên phiếu ghi sau khi khôi phục có thể không tới máy nào (design §5.5). Trước khi khởi động lại phải đặt `meta.seq` của bản khôi phục lớn hơn giá trị trong CSDL đang hỏng.

Vì hai hậu quả này, chỉ làm 2b khi CSDL mới bị hỏng thật, và **hỏi cả nhóm trước** (CLAUDE.md bất biến 1: không mất dữ liệu người dùng). Giữ file CSDL đang hỏng trong `~/backup/hong/` như mục khôi phục.

**3. Điện thoại:** máy đã bấm "Tải lại" lên bản mới sẽ nhận bản cũ như một bản cập nhật bình thường ở lần mở app kế tiếp (dải "Có phiên bản mới"). Dữ liệu trên máy giữ nguyên vì schema IndexedDB chỉ thêm, không bớt; nếu bản mới đã nâng schema Dexie thì báo nhóm trước khi quay lại, vì bản cũ không mở được CSDL đã nâng.

## Tài khoản

> 🕘 **Mục này đang chuyển dần sang [ADR 0003](adr/0003-accounts-and-owner-role.md)** (tự tạo tài khoản bằng tên + mật khẩu, mở tổ chức qua admin duyệt, trang quản trị `/admin/`). TV2-14 đã có phía server (migration 4, `/api/auth/*`); app khảo sát vẫn đăng nhập bằng mã tới TV2-16, TV1-14; CLI theo tên đăng nhập ở TV3-12; chỉ định Owner ở TV2-15.

### Nâng cấp lên migration 4 (TV2-14)

Migration 4 chạy khi server khởi động lần đầu với bản mới. Nó **dừng và server không khởi động** nếu còn tài khoản admin là thành viên tổ chức nào (ADR 0003 §5); CSDL giữ nguyên ở `user_version = 3`.

0. Timer tự deploy đã cài thì dừng nó **trước khi merge** PR có migration này (mục [Tạm dừng, gỡ](#tạm-dừng-gỡ)), chạy lại sau bước 2.
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

**API admin** (design §7, TV2-15), gọi với token admin (lấy bằng lệnh `curl` đăng nhập ở trên). Việc thường ngày làm ở trang quản trị `/admin/` (TV1-16: A1 duyệt/từ chối, A2 khoá/mở, Đổi Owner); các lệnh này để tự động hoá hoặc khi trang lỗi. Admin **không tạo tổ chức trực tiếp** nữa: người dùng gửi yêu cầu mở tổ chức, admin duyệt, người gửi thành Owner.

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

Có hai loại bản sao lưu, mỗi loại giữ 7 bản mới nhất và không xoá bản của loại kia:

| | Lúc chạy | Gồm | Ở đâu |
|---|---|---|---|
| Trước deploy | `deploy.sh`, trước khi khởi động lại (bản mới có thể chạy migration) | CSDL | `~/backup/survey-<ngày giờ>-<commit cũ>.db` |
| Hằng ngày | systemd timer, 03:00 giờ Việt Nam | CSDL **và ảnh** | `~/backup/daily/<ngày giờ>/` gồm `survey.db` và `uploads/` |

Cả hai dùng `VACUUM INTO` qua `node:sqlite` (máy không cài `sqlite3`) nên chạy được khi server đang chạy, và kiểm tra toàn vẹn bản sao. Bản hằng ngày ([`scripts/backup-daily.mjs`](../scripts/backup-daily.mjs)) sao lưu CSDL trước rồi mới chép ảnh, vì server ghi file ảnh trước khi ghi dòng `attachments`. Sau đó script kiểm mọi ảnh CSDL nhắc tới có trong bản sao, đúng cỡ và SHA-256. Kiểm không qua thì không tạo bản mới, các bản cũ giữ nguyên, timer ghi lỗi (xem `systemctl --failed`).

Hai loại đều nằm **cùng ổ đĩa với server**: cứu được khi lỡ tay hay CSDL hỏng, không cứu được khi mất ổ đĩa hay mất máy ảo. Phần đó dựa vào bản kéo về hằng tuần ở dưới ([tech-debt.md](tech-debt.md) N9).

### Chuyển ảnh ra ngoài repo (một lần)

Cho máy cài trước TV3-13, ảnh còn ở `~/app/server/uploads`. Làm trước khi bật sao lưu hằng ngày, vì timer đọc ảnh ở `~/survey-data/uploads`. Server dừng khoảng một phút; điện thoại gửi lỗi trong lúc đó sẽ tự thử lại.

```bash
cd ~/app && node --no-warnings scripts/backup-db.mjs server/data/survey.db ~/backup/survey-$(date +%Y%m%d-%H%M%S)-truoc-chuyen-anh.db
sudo systemctl stop survey-api
mkdir -p ~/survey-data
mv ~/app/server/uploads ~/survey-data/uploads    # chưa có ảnh nào thì: mkdir -p ~/survey-data/uploads
sudo nano /etc/systemd/system/survey-api.service  # thêm dòng Environment=UPLOAD_DIR=... như mục 6, hoặc không cần gõ tay: 3 dòng dưới
# sudo cp /etc/systemd/system/survey-api.service /etc/systemd/system/survey-api.service.bak-$(date +%Y%m%d)
# grep -q '^Environment=UPLOAD_DIR=' /etc/systemd/system/survey-api.service || sudo sed -i '/^Environment=DB_PATH=data\/survey\.db$/a Environment=UPLOAD_DIR=/home/azureuser/survey-data/uploads' /etc/systemd/system/survey-api.service
# systemctl cat survey-api | grep -c '^Environment=UPLOAD_DIR='   # phải là 1; khác thì chép bản .bak trả lại
sudo systemctl daemon-reload
sudo systemctl start survey-api
for i in $(seq 1 30); do curl -fsS http://localhost:3001/api/health && break; sleep 1; done
systemctl show survey-api -p Environment | grep -o 'UPLOAD_DIR=[^ ]*'   # UPLOAD_DIR=/home/azureuser/survey-data/uploads
```

Kiểm: mở trên app một phiếu đã có ảnh từ trước, ảnh phải hiện. Không hiện thì xem lại dòng `UPLOAD_DIR` và `ls ~/survey-data/uploads` (phải có thư mục theo `projectId`).

### Bật sao lưu hằng ngày

`/etc/systemd/system/survey-backup.service`:

```ini
[Unit]
Description=Sao lưu hằng ngày CSDL và ảnh (TV3-13)

[Service]
Type=oneshot
User=azureuser
WorkingDirectory=/home/azureuser/app
ExecStart=/usr/bin/node --no-warnings scripts/backup-daily.mjs server/data/survey.db /home/azureuser/survey-data/uploads /home/azureuser/backup/daily
```

`/etc/systemd/system/survey-backup.timer`:

```ini
[Unit]
Description=Chạy survey-backup mỗi ngày

[Timer]
OnCalendar=*-*-* 03:00:00 Asia/Ho_Chi_Minh
# Máy ảo tắt qua 03:00 thì chạy bù ngay khi bật lại.
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now survey-backup.timer
sudo systemctl start survey-backup      # chạy thử một lần ngay
journalctl -u survey-backup -n 5 --no-pager   # "Đã sao lưu ... (N ảnh trong CSDL, ...); giữ 1 bản"
systemctl list-timers survey-backup     # cột NEXT là 03:00 giờ Việt Nam hôm sau
```

Số "ảnh trong CSDL" là số ảnh đã kiểm. "File ảnh đã chép" có thể lớn hơn một chút: đó là ảnh server vừa ghi file nhưng chưa kịp ghi CSDL lúc sao lưu, vô hại.

Thỉnh thoảng xem dung lượng (ổ 64 GiB; mỗi bản hằng ngày chứa toàn bộ ảnh):

```bash
df -h /
du -sh ~/backup/daily/*
```

### Kéo bản sao lưu về máy khác (hằng tuần)

Người có khoá SSH (hiện là Dương) kéo bản hằng ngày mới nhất về máy mình mỗi tuần, giữ 4 bản gần nhất. Trên máy Windows (PowerShell):

```powershell
$k = "$HOME\.ssh\se2026-staging_key.pem"; $h = "azureuser@se2026-t21.koreacentral.cloudapp.azure.com"
$b = ssh -i $k $h 'ls -1 ~/backup/daily | tail -1'
New-Item -ItemType Directory -Force "$HOME\se2026-backup" | Out-Null
scp -r -i $k "${h}:backup/daily/$b" "$HOME\se2026-backup\"
```

Bản sao chứa dữ liệu khảo sát thật (phiếu, ảnh, hash mật khẩu): để trên máy cá nhân có khoá màn hình, không đưa lên chat hay ổ chia sẻ công khai.

### Sao lưu tay

```bash
cd ~/app && node --no-warnings scripts/backup-db.mjs server/data/survey.db ~/backup/survey-$(date +%Y%m%d-%H%M%S)-tay.db   # chỉ CSDL
sudo systemctl start survey-backup                                                                                      # CSDL và ảnh, như bản hằng ngày
```

### Khôi phục

Khôi phục là **lùi dữ liệu về lúc sao lưu**: mất mọi phiếu, ảnh, tài khoản server nhận sau lúc đó, và điện thoại đã nhận `200` sẽ không gửi lại (như nhánh 2b ở [Quay lại bản trước](#quay-lại-bản-trước)). Chỉ làm khi CSDL hoặc ảnh hỏng thật, và **hỏi cả nhóm trước**. Ưu tiên bản hằng ngày vì có cả ảnh.

```bash
sudo systemctl stop survey-api
b=~/backup/daily/<bản cần khôi phục>           # ls -1 ~/backup/daily
hong=~/backup/hong/$(date +%Y%m%d-%H%M%S)
mkdir -p "$hong"
mv ~/app/server/data/survey.db* "$hong"/        # giữ bản đang hỏng, không xoá
mv ~/survey-data/uploads "$hong"/uploads
cp "$b/survey.db" ~/app/server/data/survey.db
cp -r "$b/uploads" ~/survey-data/uploads
```

Trước khi bật server, nâng bộ đếm `seq` của bản khôi phục lên trên giá trị trong CSDL hỏng. Không làm thì điện thoại đang giữ cursor lớn hơn sẽ bỏ qua phiếu ghi sau khi khôi phục (design §5.5):

```bash
cd ~/app && node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const q=\"SELECT v FROM meta WHERE k='seq'\";const old=new DatabaseSync(process.argv[1],{readOnly:true}).prepare(q).get().v;const db=new DatabaseSync('server/data/survey.db');console.log('seq bản khôi phục',db.prepare(q).get().v,'· bản hỏng',old);db.prepare(\"UPDATE meta SET v = max(v, ?) + 1 WHERE k='seq'\").run(old);console.log('seq mới',db.prepare(q).get().v)" "$hong/survey.db"
```

Lệnh này báo lỗi vì không mở được CSDL hỏng thì dừng lại, hỏi nhóm, chưa bật server.

```bash
sudo systemctl start survey-api
for i in $(seq 1 30); do curl -fsS http://localhost:3001/api/health && break; sleep 1; done
```

Kiểm như mục "Kiểm tra sau khi triển khai", rồi mở một phiếu có ảnh trên app. Khôi phục từ bản trước deploy (chỉ CSDL) thì làm như trên nhưng chỉ thay `survey.db` (`cp ~/backup/<bản>.db ~/app/server/data/survey.db`), **không** đụng thư mục ảnh. Ảnh nhận sau lúc sao lưu vẫn nằm trên đĩa nhưng không phiếu nào trỏ tới.

Đã thử trên máy dev (Windows) ngày 2026-10-22: chạy `backup-daily.mjs` khi server đang chạy (1 phiếu, 3 ảnh), tắt server, thay CSDL và thư mục ảnh bằng bản sao, bật lại thì tải 3 ảnh qua API đều khớp SHA-256; lệnh nâng `seq` thử riêng trên cặp CSDL hỏng/khôi phục. Chưa thử khôi phục trên staging. Phần cài đặt đã chạy trên staging ngày 2026-10-22 (TV1-19): chuyển ảnh (0 ảnh nên dùng `mkdir`, sửa unit bằng `sed`, server dừng khoảng 1 giây), bật timer, chạy thử một lần ra bản `daily/20261022-133806` (0 ảnh, 0.1 MB), kéo bản đó về máy Dương.

## Xem log, xử lý sự cố

Mỗi request API có một dòng JSON trong stdout của `survey-api`, được systemd lưu trong journal. Dòng log có `method`, `path` (không gồm query string), `status`, `durationMs` và `userId` (`null` nếu chưa xác thực); không ghi `Authorization` hay thân request. Xem request gần đây hoặc lỗi 5xx:

```bash
journalctl -u survey-api -o cat --since "15 min ago" --no-pager | grep '"path"' | tail -50
journalctl -u survey-api -o cat --since "15 min ago" --no-pager | grep '"status":5[0-9][0-9]'
```

| Triệu chứng | Lệnh xem |
|---|---|
| API lỗi, trang báo mất kết nối | `journalctl -u survey-api -n 50 --no-pager` |
| HTTPS lỗi, chứng chỉ | `journalctl -u caddy -n 50 --no-pager` |
| Trạng thái hai dịch vụ | `systemctl status survey-api caddy` |
| Bản mới chưa lên staging | `journalctl -u survey-autodeploy -n 20 --no-pager`, `systemctl list-timers survey-autodeploy` (mục [Tự deploy](#tự-deploy-sau-mỗi-lần-merge-main)) |
| Build bị `Killed` | `free -h`, kiểm tra swap còn bật |
| Khởi động lại tay | `sudo systemctl restart survey-api` / `sudo systemctl reload caddy` |

Dòng `ExperimentalWarning: SQLite is an experimental feature` trong log là bình thường.

## Việc chưa làm

Theo dõi ở [tech-debt.md](tech-debt.md) (N1 log, N9 bản sao lưu cùng ổ đĩa).

- **Bản sao lưu ngoài máy ảo:** hiện chỉ có bản kéo tay hằng tuần, nên mất ổ đĩa thì mất tới một tuần dữ liệu (N9).
