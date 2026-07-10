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

---

## PHẦN 3: CÁC TÍNH NĂNG NỔI BẬT DÀNH CHO NGƯỜI DÙNG CUỐI (USER VIEW)

Giao diện người dùng cuối mang tính thẩm mỹ cao, hỗ trợ điều hướng không gian trực quan cùng các công cụ tương tác phong phú:

### 3.1. Trải nghiệm Panorama 360 độ chuyên nghiệp
*   **Hiển thị sắc nét:** Hệ thống tự động chia nhỏ bức ảnh panorama lớn thành các mảnh nhỏ (tiles) tương ứng với nhiều cấp độ phóng to/thu nhỏ (FOV). Khi người dùng thu phóng, chỉ các mảnh ảnh tương ứng mới được tải, giúp tối ưu hóa hiệu năng và tốc độ hiển thị.
*   **Di chuyển mượt mà:** Khách tham quan có thể xoay, thu phóng hình ảnh tự do bằng chuột, bàn phím hoặc cảm ứng. Điểm nóng chuyển cảnh (Navigation Hotspots) cho phép di chuyển giữa các phòng một cách mượt mà và trực quan.

### 3.2. Bản đồ nhỏ radar đa tầng (Minimap)
*   **Hỗ trợ đa tầng (Multi-floor):** Bản đồ hỗ trợ hiển thị danh sách tầng của tòa nhà/phân khu. Khi chuyển đổi tầng, hình ảnh bản đồ tương ứng sẽ được cập nhật.
*   **Chỉ hướng radar trực quan:** Trên bản đồ có một biểu tượng chấm tròn định vị đại diện cho góc đứng của khách tham quan trong phòng, đi kèm một hình nón radar (Radar Cone) thể hiện góc nhìn và hướng camera hiện tại. Khi người dùng xoay camera 360 độ, cone radar này tự động quay tương ứng.
*   **Tương tác kéo/zoom:** Người dùng có thể di chuyển (pan) và phóng to/thu nhỏ (zoom) bản đồ nhỏ trực tiếp trên màn hình, giúp dễ dàng theo dõi vị trí tổng thể trong các không gian rộng lớn.

### 3.3. Điểm nóng Đa phương tiện (Media Hotspots)
Hệ thống cho phép gắn trực tiếp các nội dung đa phương tiện lên không gian 360 độ:
*   **Ghi chú (Note):** Hiển thị văn bản mô tả thông tin cơ bản.
*   **Hình ảnh & Bộ sưu tập (Image/Gallery):** Trình diễn ảnh đơn lẻ hoặc album ảnh động.
*   **Tài liệu PDF:** Nhúng trực tiếp tài liệu kỹ thuật, hướng dẫn sử dụng dưới dạng PDF để người dùng đọc ngay trên màn hình.
*   **Video:** Phát video hướng dẫn hoặc giới thiệu không gian.
*   **Mô hình 3D:** Tích hợp bộ xem mô hình 3D tương tác. Khách tham quan có thể dùng chuột để xoay 3D, thu phóng vật thể (ví dụ: máy móc thiết bị, nội thất) một cách sống động.
*   **YouTube & Trang web nhúng (Web Embed):** Hiển thị các video từ YouTube hoặc các trang web bên ngoài trực tiếp trong khung xem.
*   **Tô sáng vùng (Highlight Polygon):** Hiển thị các đa giác tô màu bán trong suốt bao quanh một vật thể hoặc vùng không gian (ví dụ: cửa ra vào, bảng điều khiển). Khi người dùng rê chuột vào, vùng này sẽ nổi bật lên để hướng sự chú ý.

### 3.4. Điểm nóng gửi Email tự động (Mail Hotspots)
*   **Gửi liên hệ trực quan:** Thay vì mở ứng dụng email độc lập của hệ điều hành, người dùng có thể nhấp trực tiếp vào biểu tượng Mail Hotspot trong không gian 360 độ. Một panel soạn thảo Mail Composer sẽ trượt ra từ góc màn hình.
*   **Bảo mật thông tin:** Địa chỉ email người nhận (ví dụ: email bộ phận kỹ thuật, CSKH) được ẩn hoàn toàn ở phía client để chống tình trạng thu thập email tự động của các spam bot. Quá trình gửi email được thực hiện an toàn qua API Backend.

### 3.5. Tour tham quan tự động (Auto-tour)
*   **Trình chiếu rảnh tay:** Tính năng cho phép kích hoạt kịch bản tham quan tự động. Hệ thống sẽ tự động xoay camera quét toàn cảnh phòng, sau đó tự động chuyển cảnh sang phòng tiếp theo theo một chuỗi thiết lập sẵn.
*   **Điều khiển linh hoạt:** Người dùng có thể nhấn tạm dừng (pause), tiếp tục (resume), hoặc dừng hẳn (stop) tour bất kỳ lúc nào để tự do khám phá và quay lại tour sau.

### 3.6. Giám sát Cảm biến IoT & Live Camera (WebRTC)
*   **Giám sát môi trường thời gian thực:** Hiển thị trực quan các chỉ số cảm biến môi trường (Nhiệt độ, Độ ẩm, CO2, bụi mịn PM2.5, chỉ số an toàn khói) trực tiếp tại vị trí đặt thiết bị trong không gian 360 độ.
*   **Live Stream Camera cực mượt:** Khi nhấp vào cảm biến camera, một cửa sổ popup hiện đại sẽ trình chiếu trực tiếp hình ảnh từ camera giám sát thông qua giao thức WebRTC độ trễ dưới 1 giây, cung cấp góc nhìn giám sát trực quan tức thời.

---

## PHẦN 4: HỆ THỐNG QUẢN TRỊ (ADMIN DASHBOARD)

Hệ thống quản trị cung cấp giải pháp không cần code (no-code / low-code) giúp người vận hành dễ dàng cập nhật thông tin và chỉnh sửa tour:

### 4.1. Xác thực bảo mật & Phân quyền
*   **Trang đăng nhập bảo mật:** Tất cả các tính năng quản trị được bảo vệ sau trang đăng nhập (`/admin/login.html`). Hệ thống sử dụng cơ chế xác thực session-based lưu trữ cookie an toàn.
*   **Bảo vệ API Admin:** Toàn bộ các API nghiệp vụ thay đổi dữ liệu cấu hình tại `/api/admin/*` đều được kiểm tra quyền truy cập thông qua middleware backend. Nếu chưa đăng nhập hoặc session hết hạn, yêu cầu sẽ bị từ chối với mã lỗi HTTP 401 Unauthorized.

### 4.2. Quy trình tải ảnh Panorama & Cắt gạch (Tile Generation)
*   **Xử lý ảnh tự động:** Admin chỉ cần đặt tên phòng, chọn tầng và tải lên file ảnh panorama 360 độ định dạng phẳng (equirectangular projection).
*   **Tạo Tile Pyramid:** Backend tự động chạy tiến trình xử lý ảnh sử dụng thư viện `sharp` (`generate-tiles.js`) để cắt ảnh panorama thành một cấu trúc thư mục gạch đa cấp độ phân giải (`backend/tiles/<room-name>/<roomId>/{z}/{y}/{x}.jpg`). Cấu trúc này giúp frontend chỉ tải các mảnh ảnh cần thiết tùy thuộc vào mức độ phóng to của người dùng.

### 4.3. Quản lý Phân khu & Tòa nhà (Buildings Dashboard)
*   **Gom nhóm phòng trực quan:** Hỗ trợ tạo, sửa, xóa các tòa nhà hoặc phân khu (ví dụ: Nhà xưởng A, Văn phòng B). Các phòng sau khi upload sẽ được gán vào phân khu tương ứng để tổ chức dữ liệu khoa học.
*   **Giao diện cao cấp:** Giao diện quản lý phân khu được thiết kế đồng bộ với các hiệu ứng chuyển động, dải màu gradient sang trọng, cùng các hộp thoại xác nhận (custom modal) thiết kế riêng thay thế cho các hộp thoại `prompt` và `confirm` mặc định của trình duyệt.

### 4.4. Trình biên tập tương tác trực quan (Visual Hotspot Editors)
Admin có thể cấu hình trực tiếp tất cả các loại hotspot trên giao diện trực quan:
*   **Navigation Hotspots:** Admin nhấp đúp vào vị trí bất kỳ trên màn hình 360 độ để tạo điểm chuyển cảnh, kéo thả điều chỉnh vị trí, chọn phòng đích và nhấn lưu. Tọa độ yaw/pitch được tự động tính toán và lưu trữ.
*   **Mail Hotspots:** Kéo thả để định vị điểm nóng gửi email, nhập tiêu đề, mô tả và cấu hình thông tin mail trực tiếp.
*   **Media Hotspots & Polygon Editor:** Admin có thể đính kèm tài liệu, ảnh, 3D model cho điểm nóng. Đặc biệt, hệ thống hỗ trợ trình biên tập vùng đa giác (Polygon Drawing Tool) cho phép admin vẽ các điểm nối liên tục trên màn hình để tạo ra vùng highlight bao quanh vật thể.
*   **Minimap Editor:** Tải ảnh sơ đồ mặt bằng (minimap), kéo thả định vị các chấm định vị phòng tương ứng lên bản đồ.
*   **Sensors & Camera Config:** Liên kết các điểm cảm biến IoT và cấu hình WHEP URL của Camera WebRTC cho từng vị trí phòng tương ứng.

---

## PHẦN 5: HƯỚNG DẪN CÀI ĐẶT & TRIỂN KHAI (DEPLOYMENT GUIDE)

### 5.1. Yêu cầu hệ thống
*   **Node.js:** Phiên bản 20 LTS (tối thiểu 18+).
*   **Hệ điều hành:** Hỗ trợ Windows, Linux, macOS.
*   **Công cụ build:** Trên Windows, để biên dịch thư viện `sharp` phục vụ cắt ảnh, yêu cầu cài đặt *Microsoft Visual C++ Build Tools*.

### 5.2. Cấu hình tệp tin môi trường (`.env`)
Tạo tệp `.env` tại thư mục gốc của dự án với các cấu hình cơ bản sau:
```env
PORT=3000
UPLOAD_DIR=./uploads

# Cấu hình dịch vụ email (SMTP / Resend / Brevo / SendGrid)
MAIL_PROVIDER=resend
MAIL_FROM=no-reply@yourdomain.com
RESEND_API_KEY=re_your_api_key
```

### 5.3. Khởi chạy ở môi trường phát triển (Local Development)
1.  **Cài đặt dependencies:**
    ```bash
    npm install
    ```
2.  **Khởi động các dịch vụ (Vite + Express):**
    ```bash
    npm run dev
    ```
    *   Hệ thống sẽ chạy đồng thời Vite Dev Server tại cổng `5173` và Express Server tại cổng `3000`.
    *   Vite được cấu hình proxy tất cả các request bắt đầu bằng `/api`, `/events`, `/uploads` về cổng `3000`.
    *   **Truy cập:**
        *   Màn hình người dùng (User View): `http://localhost:5173/`
        *   Màn hình quản trị (Admin Dashboard): `http://localhost:3000/admin.html`

### 5.4. Khởi chạy WebRTC Gateway (MediaMTX)
Để xem camera trực tiếp trong môi trường local:
1.  Bật cửa sổ PowerShell tại thư mục gốc dự án.
2.  Khởi chạy script:
    ```powershell
    ./start-webrtc-gateway.ps1
    ```
    *   Script sẽ tự động khởi động máy chủ MediaMTX (ưu tiên sử dụng Docker, nếu không có Docker sẽ chạy binary cục bộ).
    *   Máy chủ WebRTC Gateway sẽ hoạt động tại cổng `8554` (RTSP), `8889` (WHEP/WebRTC API) và `8888` (HLS).

### 5.5. Triển khai trên môi trường Production
Hệ thống hỗ trợ triển khai độc lập (split deploy) cực kỳ tối ưu:
*   **Backend API (Ví dụ trên Render):**
    *   Chạy lệnh khởi động: `npm start` (phục vụ thư mục build frontend tĩnh và API).
    *   Cấu hình một **Persistent Disk** và gán biến môi trường `UPLOAD_DIR` trỏ vào đĩa này (ví dụ `/var/data/uploads`) để bảo toàn các tệp tin panorama và ảnh media của khách hàng khi restart hoặc redeploy server.
*   **Frontend Admin (Ví dụ trên Netlify):**
    *   Trỏ Netlify vào thư mục `public/` (file cấu hình `netlify.toml` đã được định nghĩa sẵn).
    *   Cập nhật tệp `public/js/admin-runtime-config.js` để chỉ định endpoint của Backend API trên Render:
        ```javascript
        window.ADMIN_API_BASE_URL = "https://virtual-tour-backend.onrender.com";
        ```

---

## PHẦN 6: BẢO MẬT & TỐI ƯU HÓA VẬN HÀNH

Hệ thống được thiết kế với các quy chuẩn bảo mật và tối ưu hiệu năng để bảo vệ tài sản số của khách hàng:

### 6.1. Bảo mật API Endpoint và Xác thực người dùng
*   Hệ thống quản trị áp dụng cơ chế xác thực session-based bảo mật cao thông qua Express. Cookie chứa session được cấu hình với cờ `HttpOnly` (chống đánh cắp cookie từ client script) và `sameSite: "lax"`.
*   Trên môi trường production (HTTPS), cờ `secure` tự động được kích hoạt để đảm bảo cookie chỉ được truyền qua kênh mã hóa SSL/TLS.
*   Mỗi API thay đổi dữ liệu cấu hình đều đi qua middleware xác thực nghiêm ngặt để đảm bảo người dùng thông thường không thể can thiệp vào dữ liệu hệ thống.

### 6.2. Ẩn thông tin nhạy cảm của Mail Hotspot
*   Để bảo vệ hòm thư của khách hàng khỏi các bot quét email rác (spam bots), hệ thống không lưu địa chỉ email thực tế trên mã nguồn frontend client.
*   Mỗi mail hotspot chỉ lưu trữ một định danh chỉ mục. Khi người dùng gửi mail, frontend chỉ truyền chỉ mục này kèm nội dung thư lên API `/api/send-mail`, backend Express sẽ tự động phân giải chỉ mục này ra email thật từ file cấu hình bảo mật `data/rooms.json` và thực hiện gửi mail trực tiếp ở phía server.

### 6.3. Tối ưu hóa lưu trữ và Tài nguyên hệ thống
*   Hệ thống lưu trữ toàn bộ dữ liệu cấu hình phòng, cảm biến và kịch bản dưới dạng tệp tin JSON tĩnh trong thư mục `data/`. Điều này giúp hệ thống phản hồi cực nhanh mà không phụ thuộc vào cơ sở dữ liệu cồng kềnh.
*   Việc áp dụng tiến trình cắt nhỏ hình ảnh panorama (Sharp Tile Pyramid) giải quyết triệt để bài toán tải trang chậm đối với ảnh panorama độ phân giải cực cao (dung lượng lớn từ 10MB - 50MB), giúp thiết bị di động có cấu hình yếu cũng có thể trải nghiệm mượt mà.


