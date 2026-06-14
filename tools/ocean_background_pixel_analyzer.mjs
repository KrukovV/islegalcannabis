import fs from "node:fs";
import zlib from "node:zlib";

export const DEFAULT_OCEAN_COLOR = "#d7dcdc";

export function nearWhitePixel(r, g, b) {
  return r >= 245 && g >= 245 && b >= 245;
}

export function placeholderGrayPixel(r, g, b) {
  return Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 180 && r <= 235;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace(/^#/u, "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilterScanlines(inflated, width, height, channels) {
  const stride = width * channels;
  const output = Buffer.alloc(width * height * channels);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const prevRowOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= channels ? output[rowOffset + x - channels] : 0;
      const up = y > 0 ? output[prevRowOffset + x] : 0;
      const upLeft = y > 0 && x >= channels ? output[prevRowOffset + x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      output[rowOffset + x] = value & 0xff;
    }
    inputOffset += stride;
  }
  return output;
}

export function decodePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("PNG_SIGNATURE_INVALID");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`PNG_FORMAT_UNSUPPORTED:${bitDepth}:${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = unfilterScanlines(zlib.inflateSync(Buffer.concat(idat)), width, height, channels);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0, source = 0; index < rgba.length; index += 4, source += channels) {
    rgba[index] = raw[source];
    rgba[index + 1] = raw[source + 1];
    rgba[index + 2] = raw[source + 2];
    rgba[index + 3] = channels === 4 ? raw[source + 3] : 255;
  }
  return { width, height, data: rgba };
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

export function encodePngRgba(width, height, data) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    raw[rowOffset] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * rowBytes, rowBytes).copy(raw, rowOffset + 1);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND")
  ]);
}

function buildMask(width, height, options = {}) {
  const stride = Math.max(1, Number(options.sampleStride || 2) || 2);
  const sampleWidth = Math.ceil(width / stride);
  const sampleHeight = Math.ceil(height / stride);
  const excludedBottom = Math.floor(sampleHeight * Number(options.excludeBottomRatio ?? 0.16));
  const sampleRects = Array.isArray(options.sampleRects)
    ? options.sampleRects.map((rect) => ({
        x: Math.max(0, Math.floor(Number(rect.x || 0) * sampleWidth)),
        y: Math.max(0, Math.floor(Number(rect.y || 0) * sampleHeight)),
        width: Math.max(1, Math.ceil(Number(rect.width || 1) * sampleWidth)),
        height: Math.max(1, Math.ceil(Number(rect.height || 1) * sampleHeight))
      }))
    : [];
  return {
    stride,
    sampleWidth,
    sampleHeight,
    included(y, x) {
      if (y >= sampleHeight - excludedBottom) return false;
      if (!sampleRects.length) return true;
      return sampleRects.some((rect) =>
        x >= rect.x &&
        y >= rect.y &&
        x < rect.x + rect.width &&
        y < rect.y + rect.height
      );
    }
  };
}

function largestComponent(mask, width, height, strideScale) {
  const visited = new Uint8Array(mask.length);
  let largest = 0;
  let componentCount = 0;
  const queue = [];
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);
    let size = 0;
    while (queue.length) {
      const current = queue.pop();
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    const scaledSize = size * strideScale;
    largest = Math.max(largest, scaledSize);
    if (scaledSize > 500) componentCount += 1;
  }
  return { largest, componentCount };
}

export function analyzeOceanPixelsFromRgba(data, width, height, options = {}) {
  const { stride, sampleWidth, sampleHeight, included } = buildMask(width, height, options);
  const ocean = hexToRgb(options.oceanColor || DEFAULT_OCEAN_COLOR);
  const nearWhiteMask = new Uint8Array(sampleWidth * sampleHeight);
  let total = 0;
  let nearWhite = 0;
  let placeholderGray = 0;
  let colorDeltaSum = 0;

  for (let sy = 0; sy < sampleHeight; sy += 1) {
    for (let sx = 0; sx < sampleWidth; sx += 1) {
      if (!included(sy, sx)) continue;
      const x = Math.min(width - 1, sx * stride);
      const y = Math.min(height - 1, sy * stride);
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      total += 1;
      const oceanDelta = (Math.abs(r - ocean.r) + Math.abs(g - ocean.g) + Math.abs(b - ocean.b)) / 3;
      colorDeltaSum += oceanDelta;
      if (nearWhitePixel(r, g, b)) {
        nearWhite += 1;
        nearWhiteMask[sy * sampleWidth + sx] = 1;
      }
      if (placeholderGrayPixel(r, g, b) && oceanDelta > 18) placeholderGray += 1;
    }
  }

  const components = largestComponent(nearWhiteMask, sampleWidth, sampleHeight, stride * stride);
  const nearWhiteRatio = total > 0 ? nearWhite / total : 0;
  const placeholderGrayRatio = total > 0 ? placeholderGray / total : 0;
  const oceanColorDeltaAvg = total > 0 ? colorDeltaSum / total : 0;
  const maxNearWhiteRatio = Number(options.maxNearWhiteRatio ?? 0.003);
  const maxWhiteComponentPx = Number(options.maxWhiteComponentPx ?? 500);
  const nearWhiteFails =
    nearWhiteRatio > maxNearWhiteRatio &&
    components.largest > maxWhiteComponentPx;
  return {
    near_white_ratio: Number(nearWhiteRatio.toFixed(6)),
    largest_near_white_component_px: components.largest,
    placeholder_gray_ratio: Number(placeholderGrayRatio.toFixed(6)),
    ocean_color_delta_avg: Number(oceanColorDeltaAvg.toFixed(2)),
    blank_tile_rect_count: components.componentCount,
    pass:
      !nearWhiteFails &&
      components.largest <= maxWhiteComponentPx &&
      placeholderGrayRatio <= Number(options.maxPlaceholderGrayRatio ?? 0.01)
  };
}

export function analyzePngFile(filePath, options = {}) {
  const png = decodePng(fs.readFileSync(filePath));
  return analyzeOceanPixelsFromRgba(png.data, png.width, png.height, options);
}
