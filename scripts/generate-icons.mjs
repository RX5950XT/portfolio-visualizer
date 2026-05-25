// 由 app/icon.svg 產生點陣圖示：favicon.ico（32px，PNG-in-ICO）與 apple-icon.png（180px）
// 重新產生：node scripts/generate-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'app', 'icon.svg'));

// Apple touch icon 需 PNG
const apple = await sharp(svg).resize(180, 180).png().toBuffer();
await writeFile(join(root, 'app', 'apple-icon.png'), apple);

// favicon.ico：ICO 容器內嵌 32px PNG（Vista 以後支援）
const png = await sharp(svg).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt8(0, 2); // colors
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8); // bytes
entry.writeUInt32LE(22, 12); // offset (6 + 16)
await writeFile(join(root, 'app', 'favicon.ico'), Buffer.concat([header, entry, png]));

console.log('icons generated: favicon.ico, apple-icon.png');
