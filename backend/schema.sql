-- SQL Schema Khởi tạo Cơ sở dữ liệu Beamo 360 trên Supabase PostgreSQL
-- Hướng dẫn: Mở Supabase Dashboard -> SQL Editor -> Tạo query mới -> Paste nội dung này và chạy (Run)

-- 1. Bảng buildings (Phân khu)
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY, -- Định dạng: bldg_xxx_yyy
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Bảng rooms (Phòng / Không gian panorama 360)
CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT PRIMARY KEY, -- Dùng timestamp millisecond dạng JS Number
    name TEXT NOT NULL,
    image_url TEXT NOT NULL, -- Đường dẫn/URL ảnh panorama
    tiles_path TEXT, -- Thư mục chứa tiles pyramid
    tiles_config JSONB, -- Cấu hình levels của pyramid tiles
    floor INTEGER DEFAULT 1,
    building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0
);

-- 3. Bảng hotspots (Hotspot di chuyển giữa các phòng)
CREATE TABLE IF NOT EXISTS hotspots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    yaw DOUBLE PRECISION NOT NULL,
    pitch DOUBLE PRECISION NOT NULL,
    target_room_id BIGINT NOT NULL, -- Target room ID
    rotation DOUBLE PRECISION DEFAULT 0,
    color TEXT,
    icon_url TEXT
);

-- 4. Bảng media_hotspots (Hotspot xem thông tin đa phương tiện)
CREATE TABLE IF NOT EXISTS media_hotspots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    yaw DOUBLE PRECISION NOT NULL,
    pitch DOUBLE PRECISION NOT NULL,
    title TEXT,
    description TEXT,
    media_url TEXT,
    media_type TEXT NOT NULL, -- note, image, pdf, video, 3d, gallery, youtube, web
    highlight_polygon JSONB -- Cấu trúc mảng [[yaw, pitch], ...] cho 3D highlight
);

-- 5. Bảng mail_hotspots (Hotspot kéo thả để gửi email phản hồi)
CREATE TABLE IF NOT EXISTS mail_hotspots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    yaw DOUBLE PRECISION,
    pitch DOUBLE PRECISION,
    screen_x DOUBLE PRECISION,
    screen_y DOUBLE PRECISION,
    title TEXT,
    recipient TEXT,
    subject TEXT,
    body TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Bảng sensors (Thiết bị IoT và Camera WebRTC)
CREATE TABLE IF NOT EXISTS sensors (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- environment, camera
    yaw DOUBLE PRECISION NOT NULL,
    pitch DOUBLE PRECISION NOT NULL,
    data JSONB, -- Lưu trữ dữ liệu cảm biến (nhiệt độ, độ ẩm...) hoặc config camera
    last_update TIMESTAMPTZ,
    color TEXT
);

-- 7. Bảng minimaps (Bản đồ thu nhỏ cho các tầng)
CREATE TABLE IF NOT EXISTS minimaps (
    floor_id INTEGER PRIMARY KEY,
    floor_name TEXT NOT NULL,
    image_url TEXT NOT NULL -- URL ảnh bản đồ tầng
);

-- 8. Bảng minimap_markers (Điểm phòng định vị trên bản đồ tầng)
CREATE TABLE IF NOT EXISTS minimap_markers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    floor_id INTEGER REFERENCES minimaps(floor_id) ON DELETE CASCADE,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL
);

-- 9. Bảng app_configs (Cấu hình hệ thống: api_config, tour_scenario)
CREATE TABLE IF NOT EXISTS app_configs (
    key TEXT PRIMARY KEY, -- 'api_config', 'tour_scenario'
    data JSONB NOT NULL
);

-- Hướng dẫn sau khi chạy SQL:
-- 1. Vào mục "Storage" trên Supabase Dashboard.
-- 2. Tạo một bucket mới tên là "virtual-tour".
-- 3. Bật tùy chọn "Public bucket" (Cho phép truy cập công khai không cần token để client xem được ảnh).
