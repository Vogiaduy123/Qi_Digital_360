/**
 * Script to sync all stall templates from data/stall-templates.json to Supabase Database
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../backend/db');

async function syncTemplates() {
  console.log('🚀 Đang bắt đầu đồng bộ mẫu sạp hàng lên Database Supabase...');

  const jsonPath = path.join(__dirname, '..', 'data', 'stall-templates.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ Không tìm thấy tệp data/stall-templates.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const templates = JSON.parse(raw);

  if (!Array.isArray(templates) || templates.length === 0) {
    console.warn('⚠️ Danh sách mẫu trống');
    process.exit(0);
  }

  console.log(`📦 Tìm thấy ${templates.length} mẫu sạp trong tệp cục bộ.`);

  // 1. Save to Supabase
  await db.saveStallTemplates(templates);

  // 2. Fetch back to verify
  const fromDb = await db.getStallTemplates();

  console.log(`\n✅ THÀNH CÔNG: Đã upload và xác thực ${fromDb.length} mẫu sạp trên Database Supabase!`);
  fromDb.forEach((t, i) => {
    console.log(`   ${i + 1}. [${t.icon || '🏪'}] ${t.name} (ID: ${t.id})`);
  });

  process.exit(0);
}

syncTemplates().catch(err => {
  console.error('❌ Lỗi khi đồng bộ lên database:', err);
  process.exit(1);
});
