# Hướng Dẫn Kết Nối Camera Từ Xa Vào Tour 360 (Độ Trễ Thấp)

Tài liệu rút gọn, trực quan hóa từng bước để đưa camera ở địa điểm khác (chi nhánh, nhà xưởng) về Server và hiển thị lên Tour 360 với độ trễ dưới 0.5s.

---

## 📌 Tóm Tắt 3 Việc Cần Làm

```
[1. Tại Camera]            [2. Tại Server]             [3. Vào Tour 360]
Chỉnh luồng phụ (H.264) ➔  Bật MediaMTX nhận RTSP   ➔  Dán link WHEP vào Tour
```

---

## 🗺️ Sơ Đồ Kết Nối Phần Cứng & Mạng

![Sơ đồ kết nối phần cứng Camera WebRTC](./camera_webrtc_diagram.jpg)


---

## BƯỚC 1: Chỉnh Camera để không bị trễ hình

Đăng nhập vào trang web quản trị của Camera (ví dụ: `http://192.168.1.100`):

1. **Chuẩn nén:** Chọn **H.264** *(Không dùng H.265 / H.265+)*.
2. **Luồng video:** Chọn **Sub-stream (Luồng phụ)**.
   - Độ phân giải: **720p** hoặc **D1**
   - Tốc độ khung hình: **25 fps**
   - Khoảng cách I-Frame (GOP): **25** *(bằng đúng số FPS)*
3. **Lấy link RTSP của camera:**
   - **Hikvision / Ezviz:**
     `rtsp://admin:matkhau@<IP_CAM>:554/Streaming/channels/102`
   - **Dahua / Kbvision / Imou:**
     `rtsp://admin:matkhau@<IP_CAM>:554/cam/realmonitor?channel=1&subtype=1`

---

## BƯỚC 2: Nối Mạng Camera Từ Xa Về Server

Chọn **1 trong 2 cách** sau:

### 👉 Cách A: Dùng Tailscale (Khuyên dùng — Dễ nhất, An toàn 100%)
*Áp dụng khi tại nơi đặt camera có 1 máy tính/laptop bật mạng.*

1. Đăng ký tài khoản miễn phí tại [tailscale.com](https://tailscale.com).
2. Cài app Tailscale trên **Server** và trên **Máy tính tại nơi đặt camera**.
3. Tại máy tính nơi đặt camera, mở PowerShell gõ lệnh chia sẻ mạng camera:
   ```powershell
   tailscale up --advertise-routes=192.168.1.0/24
   ```
4. Vào trang web Tailscale Admin bấm duyệt (Approve) dải mạng trên.
5. **Xong!** Từ Server giờ đã kết nối trực tiếp được tới IP `192.168.1.100` của camera.

---

### 👉 Cách B: Mở Cổng Modem (Port Forwarding)
*Áp dụng khi không có máy tính phụ tại nơi đặt camera.*

1. Vào cấu hình Modem tại nơi có camera, tìm mục **Port Forwarding**.
2. Mở cổng ngoài `15554` trỏ vào IP camera `192.168.1.100` cổng `554` (TCP).
3. Đăng ký tên miền động DDNS (ví dụ DuckDNS) nếu mạng không có IP tĩnh.
4. Link RTSP lúc này:
   `rtsp://admin:matkhau@tenmien.duckdns.org:15554/Streaming/channels/102`

---

## BƯỚC 3: Cấu Hình & Chạy MediaMTX Trên Server

1. Mở file `mediamtx.yml` ở thư mục dự án, sửa mục `paths`:

```yaml
paths:
  cam101:
    source: rtsp://admin:matkhau@192.168.1.100:554/Streaming/channels/102
    rtspTransport: tcp
    sourceOnDemand: no
```

2. Chạy file PowerShell để khởi động MediaMTX:
   ```powershell
   ./start-webrtc-gateway.ps1
   ```

---

## BƯỚC 4: Nhúng Vào Tour 360

1. Vào trang quản trị Tour: `http://localhost:3000/admin.html` (mục **Sensors**).
2. Thêm mới Sensor dạng **Camera**:
   - Tên camera: `Camera Giám Sát`
   - Loại: `camera`
   - URL WHEP:
     - Nếu chạy local: `http://<IP_SERVER>:8889/cam101/whep`
     - Nếu web chạy HTTPS: `https://<DOMAIN_WEB>/whep/cam101/whep`
3. Lưu lại và mở Tour 360 để xem video thời gian thực.

---

## ⚠️ 3 Lỗi Phổ Biến & Cách Sửa Nhanh

| Hiện tượng | Nguyên nhân | Cách khắc phục |
|---|---|---|
| **Màn hình đen xì** | Camera đang để H.265 | Đổi sang chuẩn **H.264** trong camera. |
| **Bị lỗi Mixed Content** | Web chạy HTTPS nhưng gọi link HTTP | Cấu hình Nginx reverse proxy đường dẫn `/whep/`. |
| **Video bị trễ tăng dần** | Dùng luồng Main 4K hoặc GOP quá lớn | Chuyển sang **Sub-stream 720p**, chỉnh GOP = 25. |
