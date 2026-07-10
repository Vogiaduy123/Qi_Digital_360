# BÁO CÁO BÀN GIAO DỰ ÁN VIRTUAL TOUR 360 (Qi Digital 360)

Tài liệu này được biên soạn nhằm bàn giao toàn bộ giải pháp Virtual Tour 360, bao gồm cấu trúc tính năng, hướng dẫn vận hành cho Quản trị viên (Admin), hướng dẫn trải nghiệm cho Người dùng cuối (User) và quy trình cài đặt, triển khai hệ thống.

---

## MỤC LỤC

1. [PHẦN 1: GIỚI THIỆU CHUNG & MỤC TIÊU HỆ THỐNG](#phan-1-gioi-thieu-chung-muc-tieu-he-thong)
2. [PHẦN 2: KIẾN TRÚC HỆ THỐNG & CÔNG NGHỆ CỐT LÕI](#phan-2-kien-truc-he-thong-cong-nghe-cot-loi)
3. [PHẦN 3: CÁC TÍNH NĂNG NỔI BẬT DÀNH CHO NGƯỜI DÙNG CUỐI](#phan-3-cac-tinh-nang-noi-bat-danh-cho-nguoi-dung-cuoi)
4. [PHẦN 4: HỆ THỐNG QUẢN TRỊ (ADMIN DASHBOARD)](#phan-4-he-thong-quan-tri-admin-dashboard)
5. [PHẦN 5: HƯỚNG DẪN CÀI ĐẶT & TRIỂN KHAI (DEPLOYMENT GUIDE)](#phan-5-huong-dan-cai-dat-trien-khai-deployment-guide)
6. [PHẦN 6: BẢO MẬT & TỐI ƯU HÓA VẬN HÀNH](#phan-6-bao-mat-toi-uu-hoa-van-hanh)

---

## PHẦN 1: GIỚI THIỆU CHUNG & MỤC TIÊU HỆ THỐNG

### 1.1. Giới thiệu dự án
Dự án **Virtual Tour 360 (Qi Digital 360)** là giải pháp công nghệ số hóa không gian thực tế ảo 360 độ hiện đại, cho phép người dùng khám phá các địa điểm, tòa nhà, căn hộ hoặc nhà máy từ xa qua trình duyệt web. Giải pháp giúp nâng cao hiệu quả quảng bá thương hiệu, tối ưu hóa quy trình giới thiệu không gian và nâng cao trải nghiệm khách hàng một cách chân thực nhất.

### 1.2. Mục tiêu hệ thống
*   **Trải nghiệm mượt mà:** Cung cấp trải nghiệm tham quan không gian thực tế ảo sắc nét, tốc độ tải nhanh, hoạt động ổn định trên cả máy tính lẫn thiết bị di động.
*   **Tương tác đa chiều:** Tích hợp các điểm tương tác thông tin (hotspot) phong phú như hình ảnh, video, tài liệu, mô hình 3D tương tác trực quan.
*   **Quản trị trực quan:** Cung cấp bộ công cụ quản lý kéo thả không cần lập trình, giúp dễ dàng tạo/sửa đổi tour và các điểm tương tác.
*   **Giám sát thông minh:** Kết nối các cảm biến IoT và luồng camera giám sát thời gian thực để biến Virtual Tour thành trung tâm điều hành trực quan (Digital Twin).

---

## PHẦN 2: KIẾN TRÚC HỆ THỐNG & CÔNG NGHỆ CỐT LÕI

### 2.1. Tổng quan Kiến trúc
Hệ thống được thiết kế theo kiến trúc Client-Server hiện đại, chia làm 2 phần chính và được kết nối thời gian thực:
*   **Frontend Client:** Chạy bằng Vanilla JavaScript (ES Module) và được đóng gói bởi Vite. Frontend tải dữ liệu cấu hình từ API và render giao diện 360 trực quan.
*   **Backend Express API Server:** Chạy bằng Node.js Express 5. Server chịu trách nhiệm quản lý lưu trữ dữ liệu JSON, xử lý các tệp tin đa phương tiện và thực hiện cắt nhỏ hình ảnh panorama.
*   **Real-time & Live Streaming Layer:** Bao gồm kênh kết nối Server-Sent Events (SSE) để phát thông báo đồng bộ dữ liệu và WebRTC Gateway (MediaMTX) để truyền trực tiếp luồng camera RTSP.

### 2.2. Công nghệ cốt lõi
*   **Marzipano (v0.10.2):** Thư viện JavaScript mã nguồn mở hiệu năng cao của Google dùng để render không gian 360 độ bằng WebGL. Hỗ trợ chia cấp độ thu phóng hình ảnh giúp hiển thị mượt mà.
*   **Google `<model-viewer>` (v3.4.0):** Thư viện hiển thị vật thể 3D trực quan trên nền tảng web, hỗ trợ các định dạng tiêu chuẩn như `.glb` / `.gltf` kèm khả năng xoay, zoom và xem dưới dạng AR.
*   **Express 5 (Backend Framework):** Framework web cho Node.js hỗ trợ định tuyến nhanh chóng, quản lý session đăng nhập và cung cấp RESTful API bảo mật.
*   **Sharp Image Processor:** Thư viện xử lý hình ảnh tốc độ cao dùng để xây dựng kim tự tháp ảnh (Tile Pyramid) đa phân giải từ ảnh panorama gốc, tối ưu hóa tốc độ tải trang trên các thiết bị băng thông yếu.
*   **Server-Sent Events (SSE):** Giao thức kết nối một chiều liên tục giúp Server chủ động gửi cập nhật thay đổi dữ liệu cấu hình phòng/cảm biến tới toàn bộ các Client đang mở, giúp đồng bộ hóa dữ liệu tức thì.
*   **MediaMTX (WebRTC/WHEP Gateway):** Máy chủ trung gian nhận luồng RTSP từ camera an ninh và chuyển đổi sang giao thức WebRTC (WHEP) giúp hiển thị live video trên trình duyệt với độ trễ cực thấp (dưới 1 giây).
