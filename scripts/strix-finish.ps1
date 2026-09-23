# ================================================================
#  scripts/strix-finish.ps1 — Tổng hợp kết quả Strix + Dọn sạch
# ================================================================
# Chạy SAU KHI Strix đã scan xong và bạn đã Ctrl+C server test.
#
# Việc script này làm:
#   1. Đọc log scan của Strix (nếu có) -> parse vulnerabilities
#   2. Tạo báo cáo bảo mật SECURITY_REPORT.md với danh sách cần sửa
#   3. Hỏi xác nhận rồi xóa sạch toàn bộ môi trường test sandbox
#
# Cách dùng:
#   .\scripts\strix-finish.ps1                  -> Tạo báo cáo + hỏi cleanup
#   .\scripts\strix-finish.ps1 -LogFile path    -> Chỉ định file log của Strix
#   .\scripts\strix-finish.ps1 -SkipCleanup     -> Chỉ tạo báo cáo, không xóa
#   .\scripts\strix-finish.ps1 -CleanupOnly     -> Chỉ xóa sandbox, không báo cáo
# ================================================================

param(
    [string]$LogFile    = "",      # Đường dẫn log file của Strix (tùy chọn)
    [switch]$SkipCleanup,          # Bỏ qua bước cleanup
    [switch]$CleanupOnly           # Chỉ cleanup, bỏ qua tạo báo cáo
)

$ROOT         = Split-Path -Parent $PSScriptRoot
$SANDBOX      = "$ROOT\strix-sandbox"
$DATA_BACKUP  = "$SANDBOX\data-backup"
$DOCS_SEC     = "$ROOT\docs\security"
$REPORT_FILE  = "$DOCS_SEC\SECURITY_REPORT.md"
$STRIX_LOGS   = "$SANDBOX\strix-logs"
$TIMESTAMP    = Get-Date -Format "yyyy-MM-dd HH:mm"
$DATE_SLUG    = Get-Date -Format "yyyyMMdd_HHmm"

# ─── Màu sắc ──────────────────────────────────────────────────
function Info  { param($m) Write-Host "  >>  $m" -ForegroundColor Cyan }
function OK    { param($m) Write-Host "  OK  $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "  !!  $m" -ForegroundColor Yellow }
function Err   { param($m) Write-Host "  ERR $m" -ForegroundColor Red }
function Head  { param($m) Write-Host "`n====  $m  ====" -ForegroundColor Magenta }
function Sep   { Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray }

# ──────────────────────────────────────────────────────────────
#  PHẦN 1: NHẬP KẾT QUẢ SCAN STRIX THỦ CÔNG (nếu không có log)
# ──────────────────────────────────────────────────────────────
function Read-StrixResults {
    param([string]$logPath)

    $findings = @()

    # Nếu có file log -> parse tự động
    if ($logPath -and (Test-Path $logPath)) {
        Info "Đang đọc log Strix: $logPath"
        $content = Get-Content $logPath -Raw

        # Parse các dòng có pattern lỗi phổ biến của Strix output
        $severityPatterns = @{
            "CRITICAL" = "(CRITICAL|critical|Critical)"
            "HIGH"     = "(HIGH|high|High)"
            "MEDIUM"   = "(MEDIUM|medium|Medium)"
            "LOW"      = "(LOW|low|Low)"
        }

        $lines = Get-Content $logPath
        foreach ($line in $lines) {
            # Tìm dòng mô tả lỗ hổng
            if ($line -match "(vulnerability|vuln|exploit|injection|XSS|CSRF|auth|bypass|exposure|leak)" -and
                $line -match "(CRITICAL|HIGH|MEDIUM|LOW|found|detected|confirmed)") {

                $sev = "MEDIUM"
                if ($line -match "CRITICAL") { $sev = "CRITICAL" }
                elseif ($line -match "HIGH")     { $sev = "HIGH" }
                elseif ($line -match "LOW")      { $sev = "LOW" }

                $findings += [PSCustomObject]@{
                    Severity    = $sev
                    Description = $line.Trim()
                    Source      = "auto-parsed"
                }
            }
        }

        if ($findings.Count -eq 0) {
            Warn "Không parse được kết quả tự động từ log. Chuyển sang nhập thủ công."
        } else {
            OK "Parse được $($findings.Count) findings từ log."
            return $findings
        }
    }

    # Không có log hoặc parse thất bại -> nhập thủ công
    Head "NHAP KET QUA STRIX THU CONG"
    Write-Host ""
    Write-Host "  Nhap tung lo hong Strix tim duoc. Go 'done' de ket thuc." -ForegroundColor White
    Write-Host "  Format: [CRITICAL|HIGH|MEDIUM|LOW] <mo ta ngan>" -ForegroundColor DarkGray
    Write-Host "  Vi du:  HIGH SQL Injection tai /api/rooms endpoint" -ForegroundColor DarkGray
    Write-Host ""

    $index = 1
    while ($true) {
        $input = Read-Host "  [$index] Lo hong"
        if ($input -eq "" -or $input.ToLower() -eq "done" -or $input.ToLower() -eq "x") { break }

        # Parse severity tu input
        $sev = "MEDIUM"
        $desc = $input
        if ($input -match "^(CRITICAL|HIGH|MEDIUM|LOW)\s+(.+)") {
            $sev  = $matches[1]
            $desc = $matches[2]
        } elseif ($input -match "^(critical|high|medium|low)\s+(.+)") {
            $sev  = $matches[1].ToUpper()
            $desc = $matches[2]
        }

        $findings += [PSCustomObject]@{
            Severity    = $sev
            Description = $desc
            Source      = "manual"
        }
        $index++
    }

    return $findings
}

# ──────────────────────────────────────────────────────────────
#  PHẦN 2: TẠO BÁO CÁO MARKDOWN
# ──────────────────────────────────────────────────────────────
function Build-Report {
    param($findings)

    # Đếm theo severity
    $critical = @($findings | Where-Object { $_.Severity -eq "CRITICAL" })
    $high     = @($findings | Where-Object { $_.Severity -eq "HIGH" })
    $medium   = @($findings | Where-Object { $_.Severity -eq "MEDIUM" })
    $low      = @($findings | Where-Object { $_.Severity -eq "LOW" })

    # Badge tổng quan
    $totalBadge = if ($findings.Count -eq 0) { "PASS" } elseif ($critical.Count -gt 0) { "CRITICAL" } elseif ($high.Count -gt 0) { "HIGH RISK" } else { "MEDIUM RISK" }

    $report = @"
# Báo cáo Bảo mật — Virtual Tour 360
> **Công cụ scan:** Strix AI Penetration Testing
> **Ngày scan:** $TIMESTAMP
> **Môi trường:** Sandbox test (port 5099, data giả)
> **Kết quả tổng quan:** **$totalBadge**

---

## Tóm tắt

| Mức độ | Số lượng | Cần sửa ngay? |
|--------|----------|--------------|
| 🔴 CRITICAL | $($critical.Count) | ✅ BẮT BUỘC ngay |
| 🟠 HIGH | $($high.Count) | ✅ Ưu tiên cao |
| 🟡 MEDIUM | $($medium.Count) | ⚠️ Trong sprint tới |
| 🟢 LOW | $($low.Count) | 📝 Khi có thời gian |

---

## Chi tiết các lỗ hổng

"@

    # Hàm tạo section cho từng severity
    function Add-SeveritySection {
        param($label, $icon, $items, $fixPriority)
        if ($items.Count -eq 0) { return "" }

        $section = "### $icon $label`n`n"
        $i = 1
        foreach ($item in $items) {
            $section += "#### $i. $($item.Description)`n`n"
            $section += "- **Mức độ:** $label`n"
            $section += "- **Ưu tiên sửa:** $fixPriority`n"
            $section += "- **Trạng thái:** [ ] Chưa sửa`n"
            $section += "- **Ghi chú sửa:** _(điền sau khi fix)_`n"
            $section += "`n"
            $i++
        }
        return $section
    }

    $report += Add-SeveritySection "CRITICAL" "🔴" $critical "Sửa trước khi deploy bất kỳ"
    $report += Add-SeveritySection "HIGH" "🟠" $high "Sửa trong 24-48 giờ"
    $report += Add-SeveritySection "MEDIUM" "🟡" $medium "Sửa trong sprint tiếp theo"
    $report += Add-SeveritySection "LOW" "🟢" $low "Sửa khi có thời gian"

    if ($findings.Count -eq 0) {
        $report += "### ✅ Không phát hiện lỗ hổng`n`n"
        $report += "Strix không tìm thấy lỗ hổng có thể khai thác được trong lần scan này.`n`n"
    }

    $report += @"

---

## Checklist Sửa lỗi

> Đánh dấu `[x]` khi đã fix và verify xong.

"@

    foreach ($item in $findings) {
        $icon = switch ($item.Severity) {
            "CRITICAL" { "🔴" }
            "HIGH"     { "🟠" }
            "MEDIUM"   { "🟡" }
            "LOW"      { "🟢" }
            default    { "⚪" }
        }
        $report += "- [ ] $icon **[$($item.Severity)]** $($item.Description)`n"
    }

    if ($findings.Count -eq 0) {
        $report += "- [x] ✅ Không có gì cần sửa`n"
    }

    $report += @"

---

## Hướng dẫn Sửa lỗi Thường gặp

### SQL / NoSQL Injection
```js
// SAI — truyền trực tiếp user input
db.query(`SELECT * FROM rooms WHERE id = ${req.params.id}`);

// ĐÚNG — parameterized query
db.query('SELECT * FROM rooms WHERE id = $1', [Number(req.params.id)]);
```

### Missing Auth trên Admin Route
```js
// Đảm bảo tất cả /api/admin/* route đều có middleware
router.use(authMiddleware);
router.use(roleGuard(['admin']));
```

### File Upload Vulnerability
```js
// Kiểm tra MIME type thực sự (không chỉ extension)
const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!allowedMimes.includes(file.mimetype)) {
  throw new Error('File type không được phép');
}
```

### Sensitive Data Exposure
- Không trả về `password`, `jwt_secret`, Supabase key trong API response
- Kiểm tra tất cả error handler không leak stack trace

---

## Lần scan tiếp theo

```powershell
# Reset sandbox và scan lại sau khi đã fix
npm run test:strix:reset
# Khởi động server test trong terminal 1
npm run test:strix
# Chạy Strix trong terminal 2
strix --target http://localhost:5099
# Tạo báo cáo mới
.\scripts\strix-finish.ps1 -SkipCleanup
```

---
*Report tự động tạo bởi `scripts/strix-finish.ps1` — $TIMESTAMP*
"@

    return $report
}

# ──────────────────────────────────────────────────────────────
#  PHẦN 3: CLEANUP SANDBOX + .env.test
# ──────────────────────────────────────────────────────────────
function Invoke-Cleanup {
    Head "XOA SACH MOI TRUONG TEST"

    $toDelete = @(
        @{ Path = $SANDBOX; Name = "strix-sandbox/ (data test, uploads test, backup)" }
    )

    Write-Host ""
    Write-Host "  Cac thu muc/file se xoa:" -ForegroundColor White
    foreach ($item in $toDelete) {
        if (Test-Path $item.Path) {
            Write-Host "    [x] $($item.Name)" -ForegroundColor Red
        } else {
            Write-Host "    [ ] $($item.Name) (da xoa roi)" -ForegroundColor DarkGray
        }
    }
    Write-Host ""
    Write-Host "  GIU LAI:" -ForegroundColor White
    Write-Host "    [v] .env.test (cau hinh test sandbox)" -ForegroundColor Green
    Write-Host "    [v] docs/security/SECURITY_REPORT.md (bao cao)" -ForegroundColor Green
    Write-Host "    [v] scripts/strix-test.ps1 (script test)" -ForegroundColor Green
    Write-Host "    [v] scripts/strix-finish.ps1 (script nay)" -ForegroundColor Green
    Write-Host "    [v] backend/config/env.js (da them NODE_DATA_DIR support)" -ForegroundColor Green
    Write-Host ""

    $confirm = Read-Host "  Xac nhan xoa sandbox? (y/N)"
    if ($confirm.ToLower() -ne "y") {
        Warn "Huy cleanup. Sandbox van con tai: $SANDBOX"
        return
    }

    foreach ($item in $toDelete) {
        if (Test-Path $item.Path) {
            Remove-Item -Recurse -Force $item.Path
            OK "Da xoa: $($item.Path)"
        }
    }

    Write-Host ""
    OK "CLEANUP HOAN TAT!"
    OK "Du an tro lai trang thai sach."
    Info "Bao cao bao mat van o: $REPORT_FILE"
}

# ══════════════════════════════════════════════════════════════
#  MAIN FLOW
# ══════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   STRIX FINISH — Tổng hợp + Dọn sạch        ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ─── Chỉ cleanup, bỏ báo cáo ─────────────────────────────────
if ($CleanupOnly) {
    Invoke-Cleanup
    exit 0
}

# ─── Tạo báo cáo ─────────────────────────────────────────────
Head "BUOC 1: THU THAP KET QUA SCAN"

# Tìm log file mới nhất của Strix trong sandbox
if (-not $LogFile) {
    if (Test-Path $STRIX_LOGS) {
        $latest = Get-ChildItem $STRIX_LOGS -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            $LogFile = $latest.FullName
            Info "Tim thay log Strix gan nhat: $LogFile"
        }
    }
}

$findings = Read-StrixResults -logPath $LogFile

Write-Host ""
if ($findings.Count -eq 0) {
    OK "Khong co lo hong nao duoc nhap — bao cao se ghi 'PASS'"
} else {
    OK "Tong cong: $($findings.Count) lo hong duoc ghi nhan"
    $findings | Group-Object Severity | ForEach-Object {
        Write-Host "    $($_.Name): $($_.Count)" -ForegroundColor White
    }
}

# Tạo thư mục docs/security nếu chưa có
New-Item -ItemType Directory -Force -Path $DOCS_SEC | Out-Null

Head "BUOC 2: TAO BAO CAO MARKDOWN"
$reportContent = Build-Report -findings $findings
$reportContent | Set-Content -Encoding UTF8 -Path $REPORT_FILE

Sep
OK "Bao cao da tao: $REPORT_FILE"

# Mở báo cáo trong editor mặc định
$openReport = Read-Host "  Mo bao cao ngay bay gio? (y/N)"
if ($openReport.ToLower() -eq "y") {
    Start-Process $REPORT_FILE
}

# ─── Cleanup ─────────────────────────────────────────────────
if (-not $SkipCleanup) {
    Write-Host ""
    Sep
    Invoke-Cleanup
}

Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor Magenta
OK "HOAN TAT!"
Write-Host "    Bao cao: $REPORT_FILE" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
