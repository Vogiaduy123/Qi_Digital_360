#!/usr/bin/env node

/**
 * Marzipano Tile Generator (CLI wrapper forwarding to backend/services/tileService.js)
 */

const { generateEquirectangularTiles, generateCubeTiles } = require("./backend/services/tileService");

module.exports = {
  generateEquirectangularTiles,
  generateCubeTiles
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node generate-tiles.js <input-image> <output-dir>');
    process.exit(1);
  }

  const [input, output] = args;
  generateEquirectangularTiles(input, output).catch(console.error);
}
