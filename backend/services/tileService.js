const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Generate Equirectangular Tile Pyramid
 * @param {string} inputPath Path to original panorama image
 * @param {string} outputDir Output directory for tiles
 * @returns {Object} Marzipano geometry config
 */
async function generateEquirectangularTiles(inputPath, outputDir) {
  console.log('🎨 Starting Equirectangular tile generation...');
  console.log('📷 Input:', inputPath);
  console.log('📁 Output:', outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadata = await sharp(inputPath).metadata();
  const maxWidth = metadata.width;
  
  if (!maxWidth) {
    throw new Error('Could not read image dimensions');
  }

  console.log(`📐 Image dimensions: ${maxWidth}x${metadata.height}`);

  const levels = [];
  let w = 1024;
  while (w < maxWidth) {
    levels.push({ width: w, height: Math.floor(w / 2) });
    w *= 2;
  }
  if (levels.length === 0 || levels[levels.length - 1].width !== maxWidth) {
    levels.push({ width: maxWidth, height: metadata.height });
  }

  const tileSize = 512;
  
  for (let z = 0; z < levels.length; z++) {
    const levelWidth = levels[z].width;
    const levelHeight = levels[z].height;
    
    const levelDir = path.join(outputDir, String(z + 1));
    console.log(`📦 Generating level ${z + 1}/${levels.length} (${levelWidth}x${levelHeight})...`);
    
    if (!fs.existsSync(levelDir)) fs.mkdirSync(levelDir, { recursive: true });

    const levelImageBuffer = await sharp(inputPath)
      .resize(levelWidth, levelHeight, { fit: 'fill' })
      .toBuffer();
    
    const cols = Math.ceil(levelWidth / tileSize);
    const rows = Math.ceil(levelHeight / tileSize);
    
    const tileTasks = [];

    for (let row = 0; row < rows; row++) {
      const rowDir = path.join(levelDir, String(row));
      if (!fs.existsSync(rowDir)) fs.mkdirSync(rowDir, { recursive: true });
      
      for (let col = 0; col < cols; col++) {
        const tilePath = path.join(rowDir, `${col}.jpg`);
        
        const extractWidth = Math.min(tileSize, levelWidth - col * tileSize);
        const extractHeight = Math.min(tileSize, levelHeight - row * tileSize);
        
        if (extractWidth <= 0 || extractHeight <= 0) continue;

        tileTasks.push(
          sharp(levelImageBuffer)
            .extract({ 
              left: col * tileSize, 
              top: row * tileSize, 
              width: extractWidth, 
              height: extractHeight 
            })
            .jpeg({ quality: 80, progressive: false })
            .toFile(tilePath)
        );
      }
    }

    await Promise.all(tileTasks);
  }

  const config = {
    type: 'equirectangular',
    tileSize: tileSize,
    levels: levels.map(l => ({
      width: l.width,
      height: l.height,
      tileSize: tileSize
    }))
  };

  fs.writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  console.log('✅ Tile generation complete!');
  console.log('📄 Config saved to:', path.join(outputDir, 'config.json'));

  return config;
}

class TileService {
  static async generateTiles(inputPath, outputDir) {
    return await generateEquirectangularTiles(inputPath, outputDir);
  }
}

module.exports = {
  TileService,
  generateEquirectangularTiles,
  generateCubeTiles: generateEquirectangularTiles
};
