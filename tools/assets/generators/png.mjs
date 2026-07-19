import { deflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.from(payload);
  const output = Buffer.allocUnsafe(12 + body.length);
  output.writeUInt32BE(body.length, 0);
  name.copy(output, 4);
  body.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, body])), output.length - 4);
  return output;
}

export function encodePngRgba(width, height, pixels) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error("PNG dimensions must be positive integers");
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes`);
  }
  const header = Buffer.allocUnsafe(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(scanlines, target + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
