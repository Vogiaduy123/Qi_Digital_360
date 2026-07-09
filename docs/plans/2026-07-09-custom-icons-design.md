# Tài liệu thiết kế: Nút Cài đặt & Thay đổi Icon Hotspots từ bên ngoài

Tài liệu này mô tả chi tiết thiết kế kỹ thuật để tích hợp nút cài đặt hình bánh răng ở góc trên bên phải giao diện tour người dùng, cho phép thay đổi các icon của hotspot bằng cách tải ảnh lên từ máy tính.

## 1. Yêu cầu & Ràng buộc
- **Giao diện:** Nút cài đặt hình bánh răng (`⚙️`) luôn hiển thị công khai ở góc phải bên trên giao diện xem tour.
- **Không phân quyền:** Bất kỳ ai cũng có thể bấm vào bánh răng và thay đổi cấu hình icon (không phân quyền admin).
- **Các icon tùy chỉnh được hỗ trợ:**
  - Mũi tên di chuyển (`nav_arrow`)
  - Điểm tư liệu ghi chú (`media_note`)
  - Điểm tư liệu hình ảnh (`media_image`)
  - Điểm tư liệu PDF (`media_pdf`)
  - Điểm tư liệu Video (`media_video`)
  - Điểm tư liệu mô hình 3D (`media_3d`)
  - Điểm tư liệu bộ sưu tập hình ảnh (`media_gallery`)
  - Điểm tư liệu YouTube (`media_youtube`)
  - Điểm tư liệu Trang web (`media_web`)
  - Điểm gửi Email (`mail`)
  - Điểm cảm biến IoT (`sensor`)
  - Điểm camera trực tiếp (`camera`)

## 2. Thiết kế Cơ sở Dữ liệu & Lưu trữ
- **Lưu trữ file:** Toàn bộ icon được tải lên sẽ được lưu trữ tại thư mục `/uploads/custom_icons/` (local) hoặc đẩy lên Supabase Storage bucket `virtual-tour` dưới thư mục `custom_icons/`.
- **Lưu trữ cấu hình:** Cấu hình đường dẫn các icon được lưu vào bảng `app_configs` trên Supabase (key = `'custom_icons'`) dưới dạng JSON:
  ```json
  {
    "nav_arrow": "/uploads/custom_icons/nav_arrow_12345.png",
    "media_note": "/uploads/custom_icons/media_note_12345.png",
    "media_image": "",
    "media_pdf": "",
    "media_video": "",
    "media_3d": "",
    "media_gallery": "",
    "media_youtube": "",
    "media_web": "",
    "mail": "",
    "sensor": "",
    "camera": ""
  }
  ```
  Nếu không cấu hình Supabase, hệ thống sử dụng local fallback lưu vào `data/custom-icons.json`.

## 3. Thiết kế API ở Backend (`server.js`)
Do không phân quyền nên tất cả API này sẽ được định nghĩa trực tiếp trong `server.js` (hoặc mount công khai):
- **`GET /api/custom-icons`**: Trả về cấu hình JSON hiện tại của các custom icons.
- **`POST /api/custom-icons/upload`**: Sử dụng `multer` xử lý upload ảnh icon cho một key cụ thể (ví dụ: `nav_arrow`). Lưu ảnh và trả về đường dẫn URL công khai.
- **`POST /api/custom-icons/save`**: Lưu toàn bộ cấu hình JSON mới vào database (Supabase `app_configs` hoặc local file).

## 4. Thiết kế Giao diện Panel Cài đặt ở Frontend (`src/index.html`, `src/style.css`)
- **Nút bánh răng:** `.settings-btn` được ghim ở `position: fixed; top: 20px; right: 20px; z-index: 1000;`. Khi click sẽ toggle class `open` trên panel cài đặt.
- **Bảng cài đặt:** `.settings-panel` trượt ra từ bên phải màn hình. Thiết kế kiểu kính mờ (glassmorphism), nền tối sang trọng:
  - Có scrollbar mượt mà.
  - Danh sách từng mục icon cần sửa đổi. Mỗi mục hiển thị tiêu đề, ảnh preview hiện tại (nếu có, nếu không có hiển thị icon mặc định), nút bấm "Chọn ảnh" ẩn bên dưới nhãn chọn file đẹp mắt, và nút "Reset" để xóa icon custom quay về mặc định.

## 5. Cập nhật logic hiển thị Hotspot (`src/main.js`, `src/features/...`)
- Khi tải trang, gọi API `GET /api/custom-icons` để lấy map cấu hình lưu vào biến toàn cục `window.customIcons`.
- Sửa đổi các hàm hiển thị:
  - **`createNavArrow`** (`src/main.js`): Kiểm tra nếu `window.customIcons.nav_arrow` tồn tại thì thay ảnh thay vì vẽ SVG mặc định.
  - **`createMediaHotspotElement`** (`src/features/media-overlay.js`):
    - Với `note`: thay đổi ảnh của `.info-hotspot-icon` từ `images/info.png` sang custom icon nếu có.
    - Với các loại khác: nếu có custom icon, tạo thẻ `<img>` chèn vào hotspot thay vì gán ký tự emoji mặc định.
  - **`createPanoramaMailHotspot`** (`src/features/mail.js`): Nếu có custom icon cho `mail`, tạo thẻ `<img>` thay vì emoji `✉️`.
  - **`addSensorHotspots`** (`src/features/sensors.js`): Nếu có custom icon cho `sensor` hoặc `camera`, tạo thẻ `<img>` thay vì hiển thị emoji `🌡️` / `📹` / `💻`.
