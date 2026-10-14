// 生成一张 1024x1024 的图标源图（蓝色圆角方块 + 白色"文字行"），纯 Node 实现，无第三方依赖
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 1024;
const H = 1024;
const R = 180; // 圆角半径

function makePixels() {
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const i = 1 + x * 4;
      let r = 0x00, g = 0x78, b = 0xd4, a = 255;

      // 圆角：四角透明
      const nearLeft = x < R;
      const nearRight = x >= W - R;
      const nearTop = y < R;
      const nearBottom = y >= H - R;
      if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
        const cx = nearLeft ? R : W - 1 - R;
        const cy = nearTop ? R : H - 1 - R;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > R * R) {
          a = 0;
        }
      }

      // 白色横线模拟"记事本文字"
      const inLine =
        (y > 280 && y < 340) || (y > 460 && y < 520) || (y > 640 && y < 700);
      if (inLine && x > 200 && x < W - 200) {
        r = 255; g = 255; b = 255;
      }

      row[i] = r; row[i + 1] = g; row[i + 2] = b; row[i + 3] = a;
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(makePixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'app-icon.png');
fs.writeFileSync(out, png);
console.log('written:', out, png.length, 'bytes');
