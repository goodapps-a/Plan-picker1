const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, r, g, b) {
  // Minimal uncompressed/deflated raw PNG builder
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);

    // CRC32
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + len; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        if ((crc ^ byte) & 1) {
          crc = (crc >>> 1) ^ 0xedb88320;
        } else {
          crc = crc >>> 1;
        }
        byte = byte >>> 1;
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with filter byte 0 per scanline
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLen);

  for (let y = 0; y < height; y++) {
    const offset = y * rowLen;
    rawData[offset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 4;
      // Draw dark slate background with sky-blue architectural square in center
      const inCenter =
        x > width * 0.25 &&
        x < width * 0.75 &&
        y > height * 0.25 &&
        y < height * 0.75;
      const border =
        inCenter &&
        (x < width * 0.3 ||
          x > width * 0.7 ||
          y < height * 0.3 ||
          y > height * 0.7);

      if (border) {
        rawData[px] = 56;   // Sky blue #38bdf8
        rawData[px + 1] = 189;
        rawData[px + 2] = 248;
        rawData[px + 3] = 255;
      } else {
        rawData[px] = 15;   // Slate 900 #0f172a
        rawData[px + 1] = 23;
        rawData[px + 2] = 42;
        rawData[px + 3] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'planform-icon-192.png'), createPNG(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPNG(192, 192));
fs.writeFileSync(path.join(iconsDir, 'planform-icon-512.png'), createPNG(512, 512));
fs.writeFileSync(path.join(iconsDir, 'planform-icon-maskable-512.png'), createPNG(512, 512));

console.log('Generated all PWA PNG icons successfully!');
