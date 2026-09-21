const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');

const BUCKET_NAME = 'virtual-tour';

/**
 * Lấy MIME Type phù hợp với file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Quét toàn bộ file trong thư mục đệ quy
 */
function getAllFilesRecursive(dirPath, fileList = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFilesRecursive(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

/**
 * Loại bỏ dấu tiếng Việt và ký tự đặc biệt để làm key an toàn cho Supabase Storage
 */
function sanitizePath(filePath) {
  return filePath
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\/\.\-_]/g, '');
}

let bucketChecked = false;
async function ensureBucket() {
  if (bucketChecked) return;
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (!error && Array.isArray(buckets)) {
      const exists = buckets.some(b => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
      if (!exists) {
        await supabase.storage.createBucket(BUCKET_NAME, { public: true });
        console.log(`✅ [Storage] Created public bucket '${BUCKET_NAME}' in Supabase`);
      }
      bucketChecked = true;
    }
  } catch (err) {
    console.warn('⚠️ [Storage] Failed to auto-check bucket:', err.message);
  }
}

/**
 * Hàm helper dọn dẹp các folder rỗng sau khi xóa file
 */
function cleanupEmptyDirs(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      cleanupEmptyDirs(filePath);
      if (fs.readdirSync(filePath).length === 0) {
        fs.rmdirSync(filePath);
      }
    }
  });
}

const StorageService = {
  sanitizePath,
  
  /**
   * Tải một file đơn lẻ lên Supabase Storage
   */
  async uploadFile(localFilePath, destStoragePath) {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File local không tồn tại: ${localFilePath}`);
    }

    await ensureBucket();

    const cleanDestPath = sanitizePath(destStoragePath.replace(/^\//, ''));
    const fileBuffer = fs.readFileSync(localFilePath);
    const mimeType = getMimeType(localFilePath);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(cleanDestPath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.error(`Lỗi upload file ${cleanDestPath}:`, error.message);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(cleanDestPath);

    return publicUrlData.publicUrl;
  },

  /**
   * Upload toàn bộ folder đệ quy lên Storage và XÓA folder local sau khi upload thành công
   */
  async uploadFolder(localFolderPath, destStorageFolder) {
    if (!fs.existsSync(localFolderPath)) {
      console.warn(`Thư mục local không tồn tại: ${localFolderPath}`);
      return;
    }

    const files = getAllFilesRecursive(localFolderPath);
    console.log(`🚀 Bắt đầu upload folder: ${localFolderPath} (${files.length} tệp)`);

    const BATCH_SIZE = 50;
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (localFile) => {
        const relativePath = path.relative(localFolderPath, localFile).replace(/\\/g, '/');
        const destPath = `${destStorageFolder}/${relativePath}`.replace(/^\//, '');
        
        try {
          await this.uploadFile(localFile, destPath);
          fs.unlinkSync(localFile);
        } catch (err) {
          console.error(`❌ Upload thất bại tệp ${localFile}:`, err.message);
          throw err;
        }
      }));
      
      console.log(`⚡ Tiến trình: Đã tải lên ${Math.min(i + BATCH_SIZE, files.length)}/${files.length} tệp...`);
    }

    try {
      cleanupEmptyDirs(localFolderPath);
      if (fs.existsSync(localFolderPath) && fs.readdirSync(localFolderPath).length === 0) {
        fs.rmdirSync(localFolderPath);
      }
      console.log(`✅ Đã dọn dẹp xong thư mục tạm: ${localFolderPath}`);
    } catch (cleanupErr) {
      console.warn(`⚠️ Lỗi dọn dẹp thư mục rỗng: ${cleanupErr.message}`);
    }
  }
};

module.exports = StorageService;
