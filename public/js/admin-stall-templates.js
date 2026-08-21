/**
 * Stall Templates Management JS
 * Supports: My Templates, Online Cloud Store (1-Click Install), URL Import, and Smart Text Parsing
 */

let stallTemplates = [];
let editingTemplateId = null;
let modalSections = [];
let selectedAvatarFile = null;
let currentViewTab = 'mine';

// 🌐 16+ Online Cloud Preset Templates Library
const ONLINE_CLOUD_TEMPLATES = [
  {
    id: "cloud_coffee_tea",
    name: "Tiệm Cà phê, Trà sữa & Nước ép tươi",
    icon: "☕",
    badge: "SẠP SỐ: K-02 • KHU ẨM THỰC & GIẢI KHÁT",
    themeColor: "#78350f",
    avatar: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "NGUYÊN LIỆU TỰ NHIÊN",
    sidebarContent: "- Hạt cà phê Robusta & Arabica Cầu Đất nguyên chất\n- Trà tươi ủ mới mỗi ngày, không chất tạo hương\n- Sữa tươi thanh trùng Dalat Milk\n- Trái cây ép tươi 100% nguyên chất",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & ĐẶT MÓN",
        content: "👤 Quản lý: Tiệm Cafe Góc Phố\n📞 Hotline / Zalo: 0918.555.777\n📍 Vị trí: Sạp K-02 (Cổng 1, Đối diện Đài Phun Nước)\n⏰ Giờ mở cửa: 06:30 - 22:00 (Mở cả tuần)"
      },
      {
        title: "MENU NƯỚC UỐNG ĐẶC SẮC",
        content: "Cà Phê Muối Cố Đô\nCà Phê Trứng Béo Ngậy\nTrà Đào Cam Sả\nTrà Sữa Trân Châu Hoàng Kim\nNước Ép Bưởi Hồng\nMatcha Latte Nhật Bản"
      },
      {
        title: "DỊCH VỤ SHIP & ƯU ĐÃI",
        content: "🛵 Giao hàng: Nhận ship tận nơi từ 2 ly, freeship bán kính 2km\n🏷️ Ưu đãi: Mua 5 ly tặng 1 ly cùng size trong khung giờ 13:00 - 16:00\n💳 Thanh toán: Chuyển khoản QR, MoMo, ZaloPay, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_phones_tech",
    name: "Phụ kiện Điện thoại & Thiết bị Số",
    icon: "📱",
    badge: "SẠP SỐ: T-09 • KHU ĐIỆN TỬ & CÔNG NGHỆ",
    themeColor: "#1d4ed8",
    avatar: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "BẢO HÀNH CHÍNH HÃNG",
    sidebarContent: "- 100% Phụ kiện chính hãng Anker, Baseus, Ugreen\n- Bảo hành 1 đổi 1 trong 12 tháng\n- Dán cường lực miễn phí công dán\n- Kiểm tra và vệ sinh máy miễn phí",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & TƯ VẤN",
        content: "👤 Chủ sạp: Cửa Hàng Phụ Kiện Số 1\n📞 Hotline / Zalo: 0979.888.666\n📍 Vị trí: Sạp T-09, Tầng 2 Khu Công Nghệ\n⏰ Giờ mở cửa: 08:30 - 21:00"
      },
      {
        title: "SẢN PHẨM & PHỤ KIỆN HOT",
        content: "Củ Sạc Nhanh GaN 65W\nCáp Sạc Type-C Bọc Dù\nTai Nghe Bluetooth Chống Ồn\nỐp Lưng Chống Sốc Trong Suốt\nKính Cường Lực KingKong\nPin Sạc Dự Phòng 20.000mAh"
      },
      {
        title: "DỊCH VỤ SỬA CHỮA & GIAO HÀNG",
        content: "🛠️ Sửa chữa: Thay pin, ép kính lấy ngay sau 30 phút\n🚚 Giao hàng: Giao hỏa tốc 1h nội thành\n💳 Thanh toán: Quẹt thẻ POS, Chuyển khoản QR, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_pharmacy",
    name: "Quầy Thuốc Tây & Dược Phẩm Gia Đình",
    icon: "💊",
    badge: "QUẦY SỐ: M-01 • CHUẨN GPP BỘ Y TẾ",
    themeColor: "#059669",
    avatar: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "DƯỢC SĨ TƯ VẤN TẬN TÂM",
    sidebarContent: "- Thuốc chính hãng, nguồn gốc xuất xứ rõ ràng\n- Bán đúng giá niêm yết, tư vấn đúng bệnh\n- Đạt chuẩn thực hành tốt nhà thuốc GPP\n- Đa dạng thực phẩm chức năng & thiết bị y tế",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & NHÀ THUỐC",
        content: "👤 Dược sĩ phụ trách: DS. Lê Thanh Trúc\n📞 Hotline tư vấn: 0909.115.115\n📍 Vị trí: Quầy M-01, Cổng Chính Chợ\n⏰ Giờ mở cửa: 06:00 - 22:00 (Mở cửa tất cả ngày lễ)"
      },
      {
        title: "CÁC NHÓM SẢN PHẨM CHÍNH",
        content: "Thuốc Kê Đơn & Không Kê Đơn\nVitamin & Khoáng Chất Nhập Khẩu\nSữa Bột Dinh Dưỡng Y Học\nMáy Đo Đường Huyết & Huyết Áp\nKhẩu Trang & Dung Dịch Sát Khuẩn\nDược Mỹ Phẩm Chăm Sóc Da"
      },
      {
        title: "CHĂM SÓC KHÁCH HÀNG & GIAO THUỐC",
        content: "🛵 Giao thuốc: Giao thuốc tận nhà cho người cao tuổi trong bán kính 3km\n🩺 Miễn phí: Đo huyết áp và kiểm tra đường huyết miễn phí tại quầy\n💳 Thanh toán: Quét mã QR, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_flowers",
    name: "Tiệm Hoa Tươi & Cây Cảnh Mini",
    icon: "🌸",
    badge: "SẠP SỐ: H-03 • HOA TƯƠI ĐÀ LẠT & NHẬP KHẨU",
    themeColor: "#db2777",
    avatar: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "HOA TƯƠI CẮT CÀNH MỖI SÁNG",
    sidebarContent: "- 100% Hoa tươi mới cắt từ vườn Đà Lạt\n- Thiết kế bó hoa, lẵng hoa nghệ thuật theo yêu cầu\n- Giữ tươi lâu từ 5 - 7 ngày\n- Tặng kèm thiệp chúc mừng & túi dưỡng hoa",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & ĐẶT HOA",
        content: "👤 Chủ tiệm: Tiệm Hoa Nắng Mới\n📞 Hotline / Zalo: 0933.222.111\n📍 Vị trí: Sạp H-03, Khu Hoa Cảnh Nghệ Thuật\n⏰ Giờ mở cửa: 06:00 - 21:00"
      },
      {
        title: "CÁC LOẠI HOA & DỊCH VỤ CẮM HOA",
        content: "Hoa Hồng Ecuador Nhập Khẩu\nHoa Tulip Hà Lan\nHoa Hướng Dương Đà Lạt\nLan Hồ Điệp Ghép Chậu\nHoa Khai Trương & Hội Nghị\nCây Cảnh Để Bàn Phong Thủy"
      },
      {
        title: "GIAO HOA TẬN NƠI & BẢO ĐẢM",
        content: "🚚 Giao hoa: Giao hoa đúng giờ hẹn, chụp ảnh hoa trước khi giao\n💧 Bảo hành: Đổi mẫu mới nếu hoa bị dập nát trong quá trình vận chuyển\n💳 Thanh toán: Chuyển khoản VietQR, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_shoes_bags",
    name: "Giày Dép, Túi Xách & Phụ Kiện Thời Trang",
    icon: "👟",
    badge: "SẠP SỐ: G-15 • THỜI TRANG CAO CẤP",
    themeColor: "#475569",
    avatar: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "CHẤT LIỆU CAO CẤP",
    sidebarContent: "- Da thật 100%, đường kim mũi chỉ tinh xảo\n- Êm chân, tôn dáng, phom chuẩn xuất khẩu\n- Bảo hành keo chỉ trọn đời sản phẩm\n- Hỗ trợ đổi mẫu, đổi size trong 7 ngày",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & SHOP",
        content: "👤 Quản lý: Shop Giày & Túi Xách Paris\n📞 Hotline / Zalo: 0981.999.333\n📍 Vị trí: Sạp G-15, Tầng 1 Khu Thời Trang\n⏰ Giờ mở cửa: 08:30 - 21:30"
      },
      {
        title: "BỘ SƯU TẬP MỚI NHẤT",
        content: "Giày Cao Gót Mũi Nhọn 7cm\nGiày Sneaker Da Trắng Unisex\nGiày Tây Nam Da Bò Thật\nTúi Xách Nữ Công Sở\nVí Cầm Tay Mini Da Ý\nThắt Lưng Nam Khóa Tự Động"
      },
      {
        title: "CHÍNH SÁCH BÁN HÀNG & HẬU MÃI",
        content: "📦 Đóng gói: Hộp carton sang trọng kèm túi chống ẩm và thẻ bảo hành\n🚚 Giao hàng: Giao hàng toàn quốc, kiểm tra trước khi thanh toán\n💳 Thanh toán: VietQR, Thẻ tín dụng, MoMo, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_barber_spa",
    name: "Tiệm Cắt Tóc, Barber Shop & Spa Chăm Sóc",
    icon: "✂️",
    badge: "SẠP SỐ: S-04 • DỊCH VỤ LÀM ĐẸP CHUYÊN NGHIỆP",
    themeColor: "#1e293b",
    avatar: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "TAY NGHỀ CHUYÊN NGHIỆP",
    sidebarContent: "- Stylist giàu kinh nghiệm, cập nhật xu hướng mới\n- Sử dụng mỹ phẩm tóc chính hãng L'Oréal, Moroccanoil\n- Không gian máy lạnh sạch sẽ, thư giãn\n- Dụng cụ được tiệt trùng tia UV 100%",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & ĐẶT LỊCH",
        content: "👤 Quản lý: Phong Barber & Beauty Spa\n📞 Hotline / Đặt lịch: 0968.123.789\n📍 Vị trí: Sạp S-04, Tầng Lửng Khu Dịch Vụ\n⏰ Giờ mở cửa: 08:30 - 20:30 (Ưu tiên khách đặt trước)"
      },
      {
        title: "BẢNG DỊCH VỤ NỔI BẬT",
        content: "Combo Cắt Tóc Tạo Kiểu Nam 7 Bước\nUốn Xoăn Phồng Hàn Quốc\nNhuộm Màu Thời Trang Không Tẩy\nPhục Hồi Tóc Hư Tổn Keratin\nGội Đầu Dưỡng Sinh Thảo Dược\nChăm Sóc Da Mặt Chuyên Sâu"
      },
      {
        title: "ƯU ĐÃI & THÀNH VIÊN",
        content: "🎁 Ưu đãi: Giảm 20% cho học sinh - sinh viên\n💳 Thẻ VIP: Tích điểm đổi quà và giảm 10% trọn đời dịch vụ\n💳 Thanh toán: Quét mã VietQR, Chuyển khoản, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_bakery",
    name: "Tiệm Bánh Mì, Xôi & Điểm Tâm Sáng",
    icon: "🥖",
    badge: "SẠP SỐ: B-01 • ĐIỂM TÂM TRUYỀN THỐNG",
    themeColor: "#d97706",
    avatar: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "HƯƠNG VỊ GIA TRUYỀN",
    sidebarContent: "- Bánh mì giòn rụm nướng nóng liên tục tại chỗ\n- Pate gan tự làm béo ngậy chuẩn vị Sài Gòn\n- Thịt nguội, chả lụa loại 1 không hàn the\n- Xôi nếp nương dẻo thơm nước cốt dừa",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & ĐẶT HÀNG",
        content: "👤 Chủ sạp: Bánh Mì & Xôi Má Ba\n📞 Hotline / Đặt sỉ: 0919.223.344\n📍 Vị trí: Sạp B-01, Cổng Số 2 Khu Ăn Sáng\n⏰ Giờ mở cửa: 05:30 - 11:30 & 16:00 - 20:00"
      },
      {
        title: "THỰC ĐƠN ĐIỂM TÂM NÓNG HỔI",
        content: "Bánh Mì Thịt Nguội Pate Đặc Biệt\nBánh Mì Xíu Mại Trứng Muối\nBánh Mì Chả Cá Nha Trang Nóng\nXôi Mặn Thập Cẩm Chà Bông\nXôi Khúc Nóng Lá Khúc Tươi\nSữa Đậu Nành Lá Dứa Nhà Nấu"
      },
      {
        title: "GIAO HÀNG TẬN NƠI & ĐẶT SỐ LƯỢNG LỚN",
        content: "🛵 Giao hàng: Nhận ship ăn sáng công ty, trường học từ 5 phần\n📦 Đặt trước: Nhận đặt xôi chè cúng thôi nôi, khai trương\n💳 Thanh toán: Chuyển khoản VietQR, Tiền mặt"
      }
    ]
  },
  {
    id: "cloud_books",
    name: "Nhà Sách, Văn Phòng Phẩm & Đồ Chơi Trẻ Em",
    icon: "📚",
    badge: "SẠP SỐ: V-11 • KHU VĂN HÓA PHẨM",
    themeColor: "#0284c7",
    avatar: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80",
    sidebarTitle: "SÁCH BẢN QUYỀN CHÍNH HÃNG",
    sidebarContent: "- 100% Sách mới, chuẩn bản quyền NXB Kim Đồng, Trẻ, Nhã Nam\n- Đồ dùng học tập an toàn cho bé\n- Đồ chơi thông minh phát triển tư duy\n- Nhận bọc bìa sách và gói quà miễn phí",
    sections: [
      {
        title: "THÔNG TIN LIÊN HỆ & CỬA HÀNG",
        content: "👤 Quản lý: Nhà Sách Tuổi Thơ\n📞 Hotline / Zalo: 0948.777.999\n📍 Vị trí: Sạp V-11 & V-12, Tầng 2\n⏰ Giờ mở cửa: 08:00 - 21:30"
      },
      {
        title: "MẶT HÀNG KINH DOANH CHÍNH",
        content: "Sách Kỹ Năng & Phát Triển Bản Thân\nTruyện Tranh Manga & Comic\nDụng Cụ Học Sinh (Bút, Vở, Thước, Cặp)\nMàu Vẽ & Giấy Mỹ Thuật Chuyên Nghiệp\nĐồ Chơi Xếp Hình Lego & Boardgame\nQuà Tặng Lưu Niệm Học Sinh"
      },
      {
        title: "DỊCH VỤ TRƯỜNG HỌC & ĐỔI TRẢ",
        content: "🏷️ Chiết khấu: Giảm 10-15% cho đơn hàng văn phòng phẩm công ty/trường học\n🔄 Đổi trả: Đổi hàng miễn phí trong 7 ngày nếu lỗi in ấn\n💳 Thanh toán: Quẹt thẻ, Quét mã QR, Tiền mặt"
      }
    ]
  }
];

document.addEventListener('DOMContentLoaded', () => {
  loadStallTemplates();
  renderCloudTemplates();
});

function switchViewTab(tabName) {
  currentViewTab = tabName;

  const tabs = ['mine', 'cloud', 'url', 'text'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const sec = document.getElementById(`sec${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (sec) sec.classList.toggle('active', t === tabName);
  });
}

async function loadStallTemplates() {
  const container = document.getElementById('templatesContainer');
  const countBadge = document.getElementById('tplCountBadge');
  const myCountBadge = document.getElementById('myCountBadge');

  try {
    const res = await fetch('/api/admin/stall-templates');
    const data = await res.json();

    if (data.success && Array.isArray(data.templates)) {
      stallTemplates = data.templates;
    } else {
      stallTemplates = [];
    }

    if (countBadge) countBadge.textContent = stallTemplates.length;
    if (myCountBadge) myCountBadge.textContent = stallTemplates.length;
    renderMyTemplatesList();
  } catch (err) {
    console.error('Error loading stall templates:', err);
    if (container) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:#f87171;">Lỗi khi tải danh sách mẫu: ${err.message}</div>`;
    }
  }
}

function renderMyTemplatesList(filteredList = null) {
  const container = document.getElementById('templatesContainer');
  if (!container) return;

  const list = filteredList || stallTemplates;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">
        <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
        <h4 style="font-size: 16px; font-weight: 700; color: #f3f4f6; margin-bottom: 6px;">Chưa có mẫu sạp hàng nào</h4>
        <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">Bạn có thể mở tab "✨ Mẫu Gợi Ý Sẵn Có" để chọn các mẫu có sẵn vào danh sách hoặc bấm "➕ Tạo Mẫu Mới".</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button type="button" class="btn btn-primary" onclick="switchViewTab('cloud')">✨ Xem Mẫu Gợi Ý Sẵn Có</button>
          <button type="button" class="btn btn-success" onclick="openCreateTemplateModal()">➕ Tạo Mẫu Mới</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(tpl => renderSingleTemplateCard(tpl, false)).join('');
}

function renderCloudTemplates() {
  const container = document.getElementById('cloudTemplatesContainer');
  if (!container) return;

  container.innerHTML = ONLINE_CLOUD_TEMPLATES.map(tpl => renderSingleTemplateCard(tpl, true)).join('');
}

function renderSingleTemplateCard(tpl, isCloud = false) {
  const avatarUrl = tpl.avatar ? (tpl.avatar.startsWith('http') ? tpl.avatar : window.location.origin + tpl.avatar) : 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';
  const sectionNames = Array.isArray(tpl.sections) ? tpl.sections.map(s => s.title).filter(Boolean) : [];
  const sectionChips = sectionNames.map(name => `<span class="tpl-chip">${name}</span>`).join('');

  // Check if already installed
  const isInstalled = stallTemplates.some(t => t.id === tpl.id || t.name === tpl.name);

  return `
    <div class="tpl-card">
      <div class="tpl-card-stripe" style="background: ${tpl.themeColor || '#0d3834'};"></div>
      
      <div>
        <div class="tpl-card-header">
          <div class="tpl-card-icon" style="border: 1px solid ${tpl.themeColor || 'rgba(255,255,255,0.1)'};">
            ${tpl.icon || '🏪'}
          </div>
          <div class="tpl-card-title">
            <h3>${tpl.name || 'Mẫu sạp'}</h3>
            <span class="tpl-card-badge">${tpl.badge || 'MÃ SẠP'}</span>
          </div>
        </div>

        <div class="tpl-card-body">
          <div class="tpl-preview-thumb">
            <img src="${avatarUrl}" class="tpl-thumb-img" alt="Avatar">
            <div class="tpl-thumb-details">
              <div style="font-weight:700;color:#f8fafc;margin-bottom:3px;">${tpl.sidebarTitle || 'CAM KẾT CHẤT LƯỢNG'}</div>
              <div style="white-space:pre-line;max-height:40px;overflow:hidden;text-overflow:ellipsis;">${(tpl.sidebarContent || '').slice(0, 75)}...</div>
            </div>
          </div>

          <div style="font-size:11.5px;color:#94a3b8;margin-bottom:4px;">
            <strong>${sectionNames.length}</strong> mục timeline:
          </div>
          <div class="tpl-sections-chips">
            ${sectionChips || '<span style="font-size:11px;color:#64748b;">Chưa có mục nào</span>'}
          </div>
        </div>
      </div>

      <div class="tpl-card-footer">
        <button type="button" class="btn btn-small" style="background:rgba(37,99,235,0.2);color:#93c5fd;border:1px solid rgba(37,99,235,0.3);padding:4px 10px;font-size:12px;" onclick="viewGenericTemplatePreview('${tpl.id}', ${isCloud})">
          👁️ Xem thử
        </button>
        
        ${isCloud ? `
          <button type="button" class="btn btn-small ${isInstalled ? 'btn-secondary' : 'btn-success'}" style="padding:5px 12px;font-size:12px;font-weight:700;" onclick="installCloudTemplate('${tpl.id}')">
            ${isInstalled ? '✓ Đã có trong danh sách' : '➕ Dùng mẫu này'}
          </button>
        ` : `
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-small" style="background:rgba(255,255,255,0.08);color:#fff;padding:4px 8px;font-size:12px;" title="Nhân bản mẫu này" onclick="duplicateTemplate('${tpl.id}')">
              📋
            </button>
            <button type="button" class="btn btn-small btn-primary" style="padding:4px 10px;font-size:12px;" onclick="openEditTemplateModal('${tpl.id}')">
              ✏️ Sửa
            </button>
            <button type="button" class="btn btn-small btn-danger" style="padding:4px 8px;font-size:12px;" onclick="deleteTemplate('${tpl.id}')" title="Xóa mẫu">
              🗑️
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

function filterMyTemplates(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    renderMyTemplatesList();
    return;
  }

  const filtered = stallTemplates.filter(t => 
    (t.name && t.name.toLowerCase().includes(q)) ||
    (t.badge && t.badge.toLowerCase().includes(q)) ||
    (t.sidebarContent && t.sidebarContent.toLowerCase().includes(q)) ||
    (Array.isArray(t.sections) && t.sections.some(s => (s.title && s.title.toLowerCase().includes(q)) || (s.content && s.content.toLowerCase().includes(q))))
  );

  renderMyTemplatesList(filtered);
}

async function installCloudTemplate(id) {
  const tpl = ONLINE_CLOUD_TEMPLATES.find(t => t.id === id);
  if (!tpl) return;

  try {
    const res = await fetch('/api/admin/stall-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...tpl,
        id: `stall_tpl_${Date.now()}`
      })
    });
    const data = await res.json();
    if (data.success) {
      await loadStallTemplates();
      renderCloudTemplates();
      alert(`✅ Đã thêm mẫu "${tpl.name}" vào danh sách của bạn!`);
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (err) {
    alert('Lỗi khi thêm mẫu: ' + err.message);
  }
}

async function installAllCloudTemplates() {
  if (!confirm(`Thêm tất cả ${ONLINE_CLOUD_TEMPLATES.length} mẫu gợi ý vào danh sách sử dụng của bạn?`)) return;

  try {
    for (const tpl of ONLINE_CLOUD_TEMPLATES) {
      await fetch('/api/admin/stall-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tpl,
          id: `stall_tpl_${Date.now()}_${Math.floor(Math.random()*1000)}`
        })
      });
    }

    await loadStallTemplates();
    renderCloudTemplates();
    alert(`🎉 Đã thêm thành công ${ONLINE_CLOUD_TEMPLATES.length} mẫu gợi ý vào danh sách của bạn!`);
    switchViewTab('mine');
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function importFromWebUrl() {
  const urlInput = document.getElementById('importUrlInput');
  const statusDiv = document.getElementById('urlImportStatus');
  const url = (urlInput?.value || '').trim();

  if (!url || !url.startsWith('http')) {
    alert('Vui lòng nhập đường link URL hợp lệ (bắt đầu bằng http:// hoặc https://)');
    return;
  }

  statusDiv.style.display = 'block';
  statusDiv.style.background = 'rgba(56, 189, 248, 0.15)';
  statusDiv.style.color = '#38bdf8';
  statusDiv.textContent = '⏳ Đang tải dữ liệu mẫu từ liên kết mạng...';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Máy chủ từ xa phản hồi mã lỗi: ${res.status}`);
    const data = await res.json();

    const templatesToImport = Array.isArray(data) ? data : (Array.isArray(data.templates) ? data.templates : [data]);

    if (!templatesToImport || templatesToImport.length === 0 || !templatesToImport[0].name) {
      throw new Error('Dữ liệu JSON tải về không đúng cấu trúc mẫu sạp hàng');
    }

    // Save imported templates
    for (const tpl of templatesToImport) {
      await fetch('/api/admin/stall-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tpl,
          id: `stall_tpl_${Date.now()}_${Math.floor(Math.random()*1000)}`
        })
      });
    }

    statusDiv.style.background = 'rgba(16, 185, 129, 0.15)';
    statusDiv.style.color = '#6ee7b7';
    statusDiv.textContent = `✅ Đã tải và cài đặt thành công ${templatesToImport.length} mẫu sạp từ URL!`;

    await loadStallTemplates();
    setTimeout(() => { switchViewTab('mine'); }, 1200);
  } catch (err) {
    statusDiv.style.background = 'rgba(239, 68, 68, 0.15)';
    statusDiv.style.color = '#f87171';
    statusDiv.textContent = `❌ Không thể tải mẫu từ link này: ${err.message}`;
  }
}

function processSmartText() {
  const text = (document.getElementById('smartTextInput')?.value || '').trim();
  if (!text) {
    alert('Vui lòng dán nội dung giới thiệu sạp hàng hoặc quán ăn');
    return;
  }

  // Smart heuristic extractor
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let name = lines[0] ? lines[0].replace(/^[\d\.\-\*#]+\s*/, '') : 'Mẫu Sạp Mới';
  if (name.length > 50) name = name.slice(0, 50);

  // Extract phone
  let phone = '';
  const phoneMatch = text.match(/(0\d{9,10}|\+84\d{9,10}|0\d{2,3}[\.\s]\d{3}[\.\s]\d{3,4})/);
  if (phoneMatch) phone = phoneMatch[0];

  // Extract location / stall number
  let location = '';
  const locMatch = text.match(/(Sạp|Kiot|Gian hàng|Số|Cổng|Tầng|Địa chỉ|Đ\/c)[\s:]*([^\n,]+)/i);
  if (locMatch) location = locMatch[0].trim();

  // Extract quality commits
  let commitLines = [];
  lines.forEach(l => {
    if (/(cam kết|chuẩn|tươi|an toàn|vietgap|bảo hành|chính hãng|100%|miễn phí)/i.test(l) && !commitLines.includes(l)) {
      commitLines.push(l.replace(/^[•\-\*]\s*/, ''));
    }
  });

  // Extract products
  let productLines = [];
  lines.forEach(l => {
    if (!commitLines.includes(l) && !l.includes(phone) && (l.includes('Menu') || l.includes('Món') || l.includes('Mặt hàng') || (l.length < 40 && !l.includes(':')))) {
      productLines.push(l.replace(/^(menu|thực đơn|mặt hàng|sản phẩm)[\s:]*/i, '').replace(/^[•\-\*]\s*/, ''));
    }
  });

  // Open modal with extracted data
  openCreateTemplateModal();

  document.getElementById('tplName').value = name;
  document.getElementById('tplBadge').value = location ? `SẠP: ${location.toUpperCase()}` : `SẠP: ${name.toUpperCase()}`;
  document.getElementById('tplSidebarTitle').value = 'CAM KẾT CHẤT LƯỢNG';
  document.getElementById('tplSidebarContent').value = commitLines.length > 0 ? commitLines.map(c => `- ${c}`).join('\n') : '- Nguồn hàng chất lượng cao\n- Đổi trả linh hoạt\n- Phục vụ tận tâm';

  modalSections = [
    {
      title: 'THÔNG TIN LIÊN HỆ & VỊ TRÍ',
      content: `👤 Đại diện: ${name}\n📞 Hotline / Zalo: ${phone || '09xx.xxx.xxx'}\n📍 Vị trí: ${location || 'Khu Chợ / Trung tâm'}\n⏰ Giờ mở cửa: 07:00 - 21:00`
    },
    {
      title: 'MẶT HÀNG KINH DOANH CHÍNH',
      content: productLines.length > 0 ? productLines.join('\n') : 'Mặt hàng 1\nMặt hàng 2\nMặt hàng 3'
    },
    {
      title: 'CHÍNH SÁCH & THANH TOÁN',
      content: '🚚 Giao hàng: Giao hàng tận nơi hỏa tốc\n💳 Thanh toán: Chuyển khoản QR, Tiền mặt'
    }
  ];

  renderModalSections();
  updateLivePreview();
}

function pickEmoji(emoji) {
  const input = document.getElementById('tplIcon');
  if (input) {
    input.value = emoji;
    updateLivePreview();
  }
}

function openCreateTemplateModal() {
  editingTemplateId = null;
  selectedAvatarFile = null;
  document.getElementById('modalEditorTitle').textContent = '➕ Tạo Mẫu Sạp Hàng Mới';

  document.getElementById('tplName').value = '';
  document.getElementById('tplIcon').value = '🏪';
  document.getElementById('tplBadge').value = 'SẠP SỐ: ... • KHU ...';
  document.getElementById('tplThemeColor').value = '#0d3834';
  document.getElementById('tplThemeColorText').value = '#0d3834';
  document.getElementById('tplAvatarUrl').value = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';
  document.getElementById('tplSidebarTitle').value = 'CAM KẾT CHẤT LƯỢNG';
  document.getElementById('tplSidebarContent').value = '- Nguồn hàng tươi sạch mỗi ngày\n- Chuẩn an toàn VietGAP\n- Đổi trả nếu hàng không đạt';

  modalSections = [
    {
      title: 'THÔNG TIN LIÊN HỆ & VỊ TRÍ',
      content: '👤 Chủ sạp: ...\n📞 Hotline / Zalo: 09xx.xxx.xxx\n📍 Vị trí: Sạp ...\n⏰ Giờ mở cửa: 06:00 - 18:30'
    },
    {
      title: 'MẶT HÀNG KINH DOANH CHÍNH',
      content: 'Mặt hàng 1\nMặt hàng 2\nMặt hàng 3\nMặt hàng 4'
    },
    {
      title: 'CHÍNH SÁCH BÁN HÀNG & THANH TOÁN',
      content: '🚚 Giao hàng: Freeship đơn từ 150k\n💳 Thanh toán: Chuyển khoản QR, Tiền mặt'
    }
  ];

  renderModalSections();
  updateLivePreview();
  document.getElementById('templateModal').classList.add('active');
}

function openEditTemplateModal(id) {
  const tpl = stallTemplates.find(t => t.id === id);
  if (!tpl) return;

  editingTemplateId = id;
  selectedAvatarFile = null;
  document.getElementById('modalEditorTitle').textContent = `✏️ Chỉnh Sửa Mẫu: ${tpl.name || ''}`;

  document.getElementById('tplName').value = tpl.name || '';
  document.getElementById('tplIcon').value = tpl.icon || '🏪';
  document.getElementById('tplBadge').value = tpl.badge || '';
  document.getElementById('tplThemeColor').value = tpl.themeColor || '#0d3834';
  document.getElementById('tplThemeColorText').value = tpl.themeColor || '#0d3834';
  document.getElementById('tplAvatarUrl').value = tpl.avatar || '';
  document.getElementById('tplSidebarTitle').value = tpl.sidebarTitle || 'CAM KẾT CHẤT LƯỢNG';
  document.getElementById('tplSidebarContent').value = tpl.sidebarContent || '';

  modalSections = Array.isArray(tpl.sections) ? tpl.sections.map(s => ({ title: s.title, content: s.content })) : [];

  renderModalSections();
  updateLivePreview();
  document.getElementById('templateModal').classList.add('active');
}

function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('active');
  editingTemplateId = null;
  selectedAvatarFile = null;
}

function renderModalSections() {
  const container = document.getElementById('modalSectionsContainer');
  if (!container) return;

  if (modalSections.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:6px;">Chưa có mục nào. Nhấn "+ Thêm mục" hoặc các nút mẫu phía trên.</div>';
    return;
  }

  container.innerHTML = modalSections.map((sec, idx) => `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <input type="text" placeholder="Tiêu đề mục (VD: MẶT HÀNG CHÍNH)" value="${(sec.title || '').replace(/"/g, '&quot;')}" oninput="modalSections[${idx}].title = this.value; updateLivePreview();" style="flex:1;font-weight:700;font-size:12px;padding:4px 8px;border-radius:4px;margin-right:6px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.15);">
        <button type="button" onclick="removeModalSection(${idx})" style="background:rgba(239,68,68,0.2);color:#f87171;border:none;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;" title="Xóa mục">🗑️</button>
      </div>
      <textarea rows="2" placeholder="Nội dung (Mỗi dòng một ý)..." oninput="modalSections[${idx}].content = this.value; updateLivePreview();" style="width:100%;font-size:12px;padding:6px;border-radius:4px;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(255,255,255,0.15);">${sec.content || ''}</textarea>
    </div>
  `).join('');
}

function addModalSection(title = '', content = '') {
  modalSections.push({ title, content });
  renderModalSections();
  updateLivePreview();
}

function removeModalSection(idx) {
  modalSections.splice(idx, 1);
  renderModalSections();
  updateLivePreview();
}

function handleModalAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  selectedAvatarFile = file;
  const urlInput = document.getElementById('tplAvatarUrl');
  if (urlInput) urlInput.value = URL.createObjectURL(file);
  updateLivePreview();
}

function updateLivePreview() {
  const wrapper = document.getElementById('livePreviewWrapper');
  if (!wrapper) return;

  const badge = document.getElementById('tplBadge')?.value || 'SẠP SỐ: ...';
  const themeColor = document.getElementById('tplThemeColor')?.value || '#0d3834';
  const avatarUrl = document.getElementById('tplAvatarUrl')?.value || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';
  const sidebarTitle = document.getElementById('tplSidebarTitle')?.value || 'CAM KẾT CHẤT LƯỢNG';
  const sidebarContent = document.getElementById('tplSidebarContent')?.value || '';

  const sidebarLines = String(sidebarContent).split('\n').filter(l => l.trim());
  const sidebarHtml = sidebarLines.map(l => `<li style="position:relative;padding-left:4px;margin-bottom:5px;">• ${l.replace(/^[•\-\*]\s*/, '')}</li>`).join('');

  const timelineHtml = modalSections.map(sec => {
    const lines = String(sec.content || '').split('\n').filter(l => l.trim());
    const isTagList = lines.length > 1 && lines.every(l => l.length < 35 && !l.includes(':'));

    let contentHtml = '';
    if (isTagList) {
      contentHtml = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${lines.map((t, i) => `<span style="background:${i < 3 ? '#dcfce7' : '#e2e8f0'};color:${i < 3 ? '#166534' : '#1e293b'};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">${t.replace(/^[•\-\*]\s*/, '')}</span>`).join('')}</div>`;
    } else {
      contentHtml = `<div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">${lines.map(line => {
        let text = line.replace(/^[•\-\*]\s*/, '');
        if (text.includes(':')) {
          const parts = text.split(':');
          text = `<strong>${parts[0].trim()}:</strong> ${parts.slice(1).join(':').trim()}`;
        }
        return `<div style="font-size:12px;color:#334155;">• ${text}</div>`;
      }).join('')}</div>`;
    }

    return `
      <div style="position:relative;padding-left:18px;margin-bottom:14px;">
        <div style="position:absolute;left:0;top:4px;width:9px;height:9px;border-radius:50%;background:#0d3834;border:2px solid #fff;box-shadow:0 0 0 1.5px #0d3834;"></div>
        <div style="font-weight:800;font-size:12.5px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1.5px solid #0f172a;padding-bottom:2px;display:inline-block;margin-bottom:3px;">${sec.title || 'THÔNG TIN'}</div>
        ${contentHtml}
      </div>
    `;
  }).join('');

  wrapper.innerHTML = `
    <div style="display:grid;grid-template-columns:220px 1fr;background:#fdfbfb;border-radius:10px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.3);color:#1e293b;border:1px solid rgba(255,255,255,0.1);font-family:'Outfit', sans-serif;">
      <div style="background:linear-gradient(175deg, #092c28 0%, ${themeColor} 60%, #082622 100%);color:#fff;padding:16px;text-align:center;">
        <div style="position:relative;width:100px;height:100px;margin:0 auto 10px;">
          <div style="position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;border:1.5px solid rgba(255,255,255,0.45);border-radius:4px;pointer-events:none;"></div>
          <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border:2px solid #fff;border-radius:2px;display:block;">
        </div>
        ${badge ? `<div style="background:rgba(255,255,255,0.15);color:#6ee7b7;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-bottom:10px;display:inline-block;">${badge}</div>` : ''}
        ${sidebarTitle ? `<div style="font-size:11.5px;font-weight:800;text-transform:uppercase;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.25);padding-bottom:3px;">${sidebarTitle}</div>` : ''}
        <ul style="list-style:none;padding:0;text-align:left;font-size:11px;line-height:1.4;color:#e2e8f0;">
          ${sidebarHtml}
        </ul>
      </div>
      <div style="padding:16px 20px;background:#fafafa;position:relative;">
        <div style="position:relative;height:100%;">
          <div style="position:absolute;left:3px;top:6px;bottom:8px;width:2px;background:#cbd5e1;"></div>
          ${timelineHtml || '<div style="color:#64748b;font-size:12px;">Chưa có mục timeline.</div>'}
        </div>
      </div>
    </div>
  `;
}

async function saveTemplateFromModal() {
  const name = (document.getElementById('tplName')?.value || '').trim();
  if (!name) {
    alert('Vui lòng nhập Tên mẫu sạp');
    return;
  }

  const icon = (document.getElementById('tplIcon')?.value || '').trim() || '🏪';
  const badge = (document.getElementById('tplBadge')?.value || '').trim();
  const themeColor = (document.getElementById('tplThemeColor')?.value || '').trim() || '#0d3834';
  let avatarUrl = (document.getElementById('tplAvatarUrl')?.value || '').trim();
  const sidebarTitle = (document.getElementById('tplSidebarTitle')?.value || '').trim();
  const sidebarContent = (document.getElementById('tplSidebarContent')?.value || '').trim();

  // If user selected a local file, upload it first
  if (selectedAvatarFile) {
    try {
      const formData = new FormData();
      formData.append('file', selectedAvatarFile);
      const upRes = await fetch('/api/admin/media/upload', { method: 'POST', body: formData });
      const upData = await upRes.json();
      if (upData.success && upData.media?.url) {
        avatarUrl = upData.media.url;
      }
    } catch (err) {
      console.warn('Avatar upload fallback error:', err);
    }
  }

  const validSections = modalSections.map(s => ({
    title: (s.title || '').trim(),
    content: (s.content || '').trim()
  })).filter(s => s.title || s.content);

  const payload = {
    id: editingTemplateId || `stall_tpl_${Date.now()}`,
    name,
    icon,
    badge,
    themeColor,
    avatar: avatarUrl,
    sidebarTitle,
    sidebarContent,
    sections: validSections
  };

  try {
    let url = '/api/admin/stall-templates';
    let method = 'POST';

    if (editingTemplateId) {
      url = `/api/admin/stall-templates/${editingTemplateId}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      closeTemplateModal();
      await loadStallTemplates();
      alert('✅ ' + (method === 'PUT' ? 'Cập nhật mẫu sạp thành công!' : 'Tạo mẫu sạp mới thành công!'));
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Lỗi khi lưu mẫu sạp: ' + err.message);
  }
}

async function deleteTemplate(id) {
  const tpl = stallTemplates.find(t => t.id === id);
  if (!tpl) return;

  if (!confirm(`Bạn có chắc chắn muốn xóa mẫu sạp "${tpl.name}"?`)) return;

  try {
    const res = await fetch(`/api/admin/stall-templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadStallTemplates();
      alert('✅ Đã xóa mẫu sạp!');
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (err) {
    alert('Lỗi khi xóa mẫu: ' + err.message);
  }
}

async function duplicateTemplate(id) {
  const tpl = stallTemplates.find(t => t.id === id);
  if (!tpl) return;

  const clonePayload = {
    ...tpl,
    id: `stall_tpl_${Date.now()}`,
    name: `${tpl.name} (Bản sao)`,
    sections: Array.isArray(tpl.sections) ? tpl.sections.map(s => ({ ...s })) : []
  };

  try {
    const res = await fetch('/api/admin/stall-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clonePayload)
    });
    const data = await res.json();
    if (data.success) {
      await loadStallTemplates();
      alert(`✅ Đã nhân bản thành công "${clonePayload.name}"!`);
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (err) {
    alert('Lỗi khi nhân bản: ' + err.message);
  }
}

async function resetDefaultTemplates() {
  if (!confirm('Bạn có chắc chắn muốn khôi phục danh sách về các mẫu mặc định ban đầu?')) return;

  try {
    const res = await fetch('/api/admin/stall-templates/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await loadStallTemplates();
      alert('✅ Đã khôi phục các mẫu mặc định thành công!');
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

function viewGenericTemplatePreview(id, isCloud = false) {
  const tpl = (isCloud ? ONLINE_CLOUD_TEMPLATES : stallTemplates).find(t => t.id === id);
  if (!tpl) return;

  const modal = document.getElementById('viewModal');
  const title = document.getElementById('viewModalTitle');
  const body = document.getElementById('viewModalBody');

  if (title) title.innerHTML = `<span>${tpl.icon || '🏪'}</span> ${tpl.name || 'Xem trước mẫu'}`;

  const avatarUrl = tpl.avatar ? (tpl.avatar.startsWith('http') ? tpl.avatar : window.location.origin + tpl.avatar) : 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';
  const sidebarLines = String(tpl.sidebarContent || '').split('\n').filter(l => l.trim());
  const sidebarHtml = sidebarLines.map(l => `<li style="position:relative;padding-left:4px;margin-bottom:6px;">• ${l.replace(/^[•\-\*]\s*/, '')}</li>`).join('');

  const sectionsList = Array.isArray(tpl.sections) ? tpl.sections : [];
  const timelineHtml = sectionsList.map(sec => {
    const lines = String(sec.content || '').split('\n').filter(l => l.trim());
    const isTagList = lines.length > 1 && lines.every(l => l.length < 35 && !l.includes(':'));

    let contentHtml = '';
    if (isTagList) {
      contentHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${lines.map((t, i) => `<span style="background:${i < 3 ? '#dcfce7' : '#e2e8f0'};color:${i < 3 ? '#166534' : '#1e293b'};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;">${t.replace(/^[•\-\*]\s*/, '')}</span>`).join('')}</div>`;
    } else {
      contentHtml = `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">${lines.map(line => {
        let text = line.replace(/^[•\-\*]\s*/, '');
        if (text.includes(':')) {
          const parts = text.split(':');
          text = `<strong>${parts[0].trim()}:</strong> ${parts.slice(1).join(':').trim()}`;
        }
        return `<div style="font-size:13px;color:#334155;">• ${text}</div>`;
      }).join('')}</div>`;
    }

    return `
      <div style="position:relative;padding-left:22px;margin-bottom:18px;">
        <div style="position:absolute;left:0;top:4px;width:10px;height:10px;border-radius:50%;background:#0d3834;border:2px solid #fff;box-shadow:0 0 0 1.5px #0d3834;"></div>
        <div style="font-weight:800;font-size:13.5px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1.5px solid #0f172a;padding-bottom:3px;display:inline-block;margin-bottom:4px;">${sec.title || 'THÔNG TIN'}</div>
        ${contentHtml}
      </div>
    `;
  }).join('');

  if (body) {
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:260px 1fr;background:#fdfbfb;border-radius:12px;overflow:hidden;box-shadow:0 15px 40px rgba(0,0,0,0.4);color:#1e293b;border:1px solid rgba(255,255,255,0.1);font-family:'Outfit', sans-serif;">
        <div style="background:linear-gradient(175deg, #092c28 0%, ${tpl.themeColor || '#0d3834'} 60%, #082622 100%);color:#fff;padding:24px;text-align:center;">
          <div style="position:relative;width:120px;height:120px;margin:0 auto 14px;">
            <div style="position:absolute;top:-5px;left:-5px;right:-5px;bottom:-5px;border:1.5px solid rgba(255,255,255,0.45);border-radius:4px;pointer-events:none;"></div>
            <img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border:2.5px solid #fff;border-radius:2px;display:block;">
          </div>
          ${tpl.badge ? `<div style="background:rgba(255,255,255,0.15);color:#6ee7b7;font-size:11px;font-weight:700;padding:3px 9px;border-radius:12px;margin-bottom:14px;display:inline-block;">${tpl.badge}</div>` : ''}
          ${tpl.sidebarTitle ? `<div style="font-size:12.5px;font-weight:800;text-transform:uppercase;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.25);padding-bottom:4px;">${tpl.sidebarTitle}</div>` : ''}
          <ul style="list-style:none;padding:0;text-align:left;font-size:11.5px;line-height:1.5;color:#e2e8f0;">
            ${sidebarHtml}
          </ul>
        </div>
        <div style="padding:24px 28px;background:#fafafa;position:relative;">
          <div style="position:relative;height:100%;">
            <div style="position:absolute;left:4px;top:8px;bottom:10px;width:2px;background:#cbd5e1;"></div>
            ${timelineHtml || '<div style="color:#64748b;font-size:12px;">Chưa có mục timeline.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  if (modal) modal.classList.add('active');
}

function closeViewModal() {
  const modal = document.getElementById('viewModal');
  if (modal) modal.classList.remove('active');
}

function exportTemplatesJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(stallTemplates, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `stall-templates-${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importTemplatesJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      const templatesToImport = Array.isArray(imported) ? imported : (Array.isArray(imported.templates) ? imported.templates : [imported]);

      if (!templatesToImport || templatesToImport.length === 0) {
        alert('File JSON không hợp lệ (cần chứa dữ liệu mẫu sạp)');
        return;
      }

      if (!confirm(`Nhập ${templatesToImport.length} mẫu sạp từ file JSON?`)) return;

      // Save each template
      for (const tpl of templatesToImport) {
        await fetch('/api/admin/stall-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...tpl,
            id: `stall_tpl_${Date.now()}_${Math.floor(Math.random()*1000)}`
          })
        });
      }

      await loadStallTemplates();
      alert(`✅ Đã nhập thành công ${templatesToImport.length} mẫu sạp!`);
    } catch (err) {
      alert('Lỗi đọc file JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}
