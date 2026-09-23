# ================================================================
#  scripts/strix-test.ps1 — Khởi động môi trường test Strix
# ================================================================
# Cách dùng:
#   .\scripts\strix-test.ps1              -> Khởi động server test
#   .\scripts\strix-test.ps1 -Reset       -> Reset data sandbox về mặc định
#   .\scripts\strix-test.ps1 -Restore     -> Khôi phục data thật từ backup
#   .\scripts\strix-test.ps1 -Cleanup     -> Xóa toàn bộ strix-sandbox/
# ================================================================

param(
    [switch]$Reset,
    [switch]$Restore,
    [switch]$Cleanup
)

$ROOT     = Split-Path -Parent $PSScriptRoot
$SANDBOX  = "$ROOT\strix-sandbox"
$DATA_BACKUP = "$SANDBOX\data-backup"
$DATA_SANDBOX = "$SANDBOX\data"
$UPLOADS_SANDBOX = "$SANDBOX\uploads"
$ENV_TEST = "$ROOT\.env.test"
$DATA_REAL = "$ROOT\data"

# ─── Màu sắc output ───────────────────────────────────────────
function Info  { param($msg) Write-Host "  i  $msg" -ForegroundColor Cyan }
function OK    { param($msg) Write-Host "  OK $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "  !! $msg" -ForegroundColor Yellow }
function Err   { param($msg) Write-Host "  !! $msg" -ForegroundColor Red }
function Head  { param($msg) Write-Host "`n=== $msg ===" -ForegroundColor Magenta }

# ─── Kiểm tra .env.test tồn tại (nếu chưa có tự động tạo) ─────
if (-not (Test-Path $ENV_TEST)) {
    Warn ".env.test chưa có -> Đang tự động tạo cấu hình test sandbox an toàn..."
    @'
# ================================================================
#  .env.test — Môi trường Sandbox Test Cô Lập (Port 5099)
#  Bảo vệ 100% dữ liệu thật và Supabase DB
# ================================================================

PORT=5099
NODE_ENV=test

JWT_SECRET=test_dev
SUPABASE_URL=
SUPABASE_KEY=
UPLOAD_DIR=strix-sandbox/uploads

MAIL_PROVIDER=smtp
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=fake_test_user
SMTP_PASS=test_pass
SMTP_SECURE=false
MAIL_FROM="Virtual Tour Test <test@virtualtour.local>"
'@ | Set-Content -Encoding UTF8 $ENV_TEST
    OK "Đã tạo .env.test an toàn"
}

# ──────────────────────────────────────────────────────────────
#  ACTION: -Cleanup — Xóa toàn bộ sandbox
# ──────────────────────────────────────────────────────────────
if ($Cleanup) {
    Head "CLEANUP SANDBOX"
    if (Test-Path $SANDBOX) {
        $confirm = Read-Host "  Xóa toàn bộ '$SANDBOX'? (y/N)"
        if ($confirm -eq "y") {
            Remove-Item -Recurse -Force $SANDBOX
            OK "Đã xóa sandbox: $SANDBOX"
        } else {
            Warn "Hủy cleanup."
        }
    } else {
        Warn "Sandbox chưa tồn tại: $SANDBOX"
    }
    exit 0
}

# ──────────────────────────────────────────────────────────────
#  ACTION: -Restore — Khôi phục data thật từ backup
# ──────────────────────────────────────────────────────────────
if ($Restore) {
    Head "KHÔI PHỤC DATA THẬT"
    if (-not (Test-Path $DATA_BACKUP)) {
        Err "Không có backup tại: $DATA_BACKUP"
        exit 1
    }
    Copy-Item -Path "$DATA_BACKUP\*" -Destination $DATA_REAL -Recurse -Force
    OK "Đã khôi phục data từ backup vào $DATA_REAL"
    exit 0
}

# ──────────────────────────────────────────────────────────────
#  SETUP SANDBOX DIRECTORIES
# ──────────────────────────────────────────────────────────────
Head "SETUP SANDBOX"

New-Item -ItemType Directory -Force -Path $SANDBOX       | Out-Null
New-Item -ItemType Directory -Force -Path $DATA_SANDBOX  | Out-Null
New-Item -ItemType Directory -Force -Path $UPLOADS_SANDBOX | Out-Null
New-Item -ItemType Directory -Force -Path $DATA_BACKUP   | Out-Null
OK "Tạo thư mục sandbox: $SANDBOX"

# Backup data thật (chỉ backup 1 lần, trừ khi -Reset)
$backupFlag = "$DATA_BACKUP\.backup_done"
if (-not (Test-Path $backupFlag) -or $Reset) {
    Info "Đang backup data thật -> $DATA_BACKUP ..."
    if (Test-Path $DATA_REAL) {
        Copy-Item -Path "$DATA_REAL\*" -Destination $DATA_BACKUP -Recurse -Force
        New-Item -ItemType File -Force -Path $backupFlag | Out-Null
        OK "Backup hoàn tất: $DATA_BACKUP"
    } else {
        Warn "Thư mục data/ chưa có, bỏ qua backup."
    }
}

# ─── Tạo data sandbox giả (nếu -Reset hoặc chưa có) ─────────
if ($Reset -or -not (Test-Path "$DATA_SANDBOX\rooms.json")) {
    Head "TẠO DATA SANDBOX GIA"

    @'
[
  {
    "id": 1700000000001,
    "name": "Test Room Alpha",
    "image": "/uploads/test-panorama.jpg",
    "tilesPath": "",
    "tilesConfig": { "levels": [] },
    "floor": 1,
    "buildingId": "test-building-001",
    "hotspots": [],
    "mediaHotspots": [],
    "mailHotspots": []
  }
]
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\rooms.json"
    OK "Tao rooms.json gia"

    @'
{ "floors": [{ "id": 1, "name": "Tang 1", "image": "", "markers": [] }] }
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\minimap.json"
    OK "Tao minimap.json gia"

    @'
[]
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\sensors.json"
    OK "Tao sensors.json gia"

    @'
[{ "id": "test-building-001", "name": "Test Building", "description": "Strix test environment" }]
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\buildings.json"
    OK "Tao buildings.json gia"

    @'
{ "enabled": false, "interval": 5000, "steps": [] }
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\tour-scenario.json"
    OK "Tao tour-scenario.json gia"

    @'
{ "weatherApiKey": "test_fake_key", "airQualityApiKey": "test_fake_key" }
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\api-config.json"
    OK "Tao api-config.json gia (khong key that)"

    New-Item -ItemType Directory -Force -Path "$DATA_SANDBOX\room-api-configs" | Out-Null
    OK "Tao thu muc room-api-configs/"

    @'
[
  {
    "id": 1700000000001,
    "username": "admin",
    "password_hash": "$2a$10$f3NqXhSsmk4qMpvB0mZ8uOLc1k8H5xYk1uO7q6E1YjWvWzQxV5P6S",
    "role": "admin",
    "display_name": "Test Administrator"
  }
]
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\users.json"
    OK "Tao users.json gia (Admin test user)"

    @'
[]
'@ | Set-Content -Encoding UTF8 "$DATA_SANDBOX\stall-templates.json"
    OK "Tao stall-templates.json gia"

} else {
    Info "Data sandbox da co, dung lai. Chay voi -Reset de tao lai."
}

# ──────────────────────────────────────────────────────────────
#  KHỞI ĐỘNG SERVER VỚI .env.test
# ──────────────────────────────────────────────────────────────
Head "KHOI DONG SERVER TEST"
Warn "Server se chay tai: http://localhost:5099"
Warn "Supabase: TAT (100% cach ly, dung JSON file trong $DATA_SANDBOX)"
Warn "Email: Sandbox (khong gui thu that)"
OK   "DU LIEU THAT VA CLOUD SUPABASE DUOC BAO VE 100% AN TOAN!"
Info "Dung server: Ctrl+C"
Write-Host ""

# Load .env.test vào process environment
Get-Content $ENV_TEST | Where-Object { $_ -match "^\s*[^#]" -and $_ -match "=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $key   = $parts[0].Trim()
    $val   = if ($parts.Length -gt 1) { $parts[1].Trim().Trim('"') } else { "" }
    if ($key) {
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

# Override các biến cốt lõi cho sandbox test
$env:DOTENV_CONFIG_PATH = $ENV_TEST
$env:NODE_DATA_DIR      = $DATA_SANDBOX
$env:UPLOAD_DIR         = $UPLOADS_SANDBOX
$env:NODE_ENV           = "test"
$env:PORT               = "5099"
$env:SUPABASE_URL       = ""
$env:SUPABASE_KEY       = ""

OK "Da load .env.test vao process environment"
Info "PORT=$env:PORT | SUPABASE_URL=(disabled) | NODE_DATA_DIR=$env:NODE_DATA_DIR"

# Khởi động server
node "$ROOT\server.js"
