const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Đang kiểm tra cú pháp toàn bộ file JavaScript trong dự án...\n');

const directoriesToCheck = [
  { dir: path.join(__dirname, '..'), files: ['server.js', 'generate-tiles.js'] },
  { dir: path.join(__dirname, '../backend'), recursive: true },
  { dir: path.join(__dirname, '../public/js'), recursive: true }
];

let totalFiles = 0;
let errors = [];

function checkFile(filePath) {
  totalFiles++;
  try {
    execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    console.log(`  ✅ OK: ${path.relative(path.join(__dirname, '..'), filePath)}`);
  } catch (err) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    console.error(`  ❌ LỖI: ${path.relative(path.join(__dirname, '..'), filePath)}`);
    console.error(errorMsg);
    errors.push({ file: filePath, error: errorMsg });
  }
}

function scanDir(dir, recursive = false) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && recursive) {
      scanDir(fullPath, true);
    } else if (item.isFile() && item.name.endsWith('.js')) {
      checkFile(fullPath);
    }
  }
}

directoriesToCheck.forEach(target => {
  if (target.files) {
    target.files.forEach(f => {
      const fullPath = path.join(target.dir, f);
      if (fs.existsSync(fullPath)) checkFile(fullPath);
    });
  } else if (target.dir) {
    scanDir(target.dir, target.recursive);
  }
});

console.log('\n----------------------------------------');
if (errors.length > 0) {
  console.error(`🚨 PHÁT HIỆN ${errors.length} FILE CÓ LỖI CÚ PHÁP TRÊN TỔNG SỐ ${totalFiles} FILE!`);
  process.exit(1);
} else {
  console.log(`✨ HOÀN HẢO: Đã kiểm tra ${totalFiles} file JS, 0 lỗi cú pháp!`);
  process.exit(0);
}
