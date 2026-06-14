import test from "node:test";
import assert from "node:assert/strict";
import { analyzeOceanPixelsFromRgba } from "./ocean_background_pixel_analyzer.mjs";

function rgba(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0];
    data[index + 1] = fill[1];
    data[index + 2] = fill[2];
    data[index + 3] = 255;
  }
  return data;
}

test("ocean analyzer fails a fully white screenshot", () => {
  const result = analyzeOceanPixelsFromRgba(rgba(80, 60, [255, 255, 255]), 80, 60, {
    sampleStride: 1,
    excludeBottomRatio: 0
  });

  assert.equal(result.pass, false);
  assert.ok(result.near_white_ratio > 0.99);
  assert.ok(result.largest_near_white_component_px > 500);
});

test("ocean analyzer fails a large white blank rectangle", () => {
  const data = rgba(120, 80, [215, 220, 220]);
  for (let y = 10; y < 50; y += 1) {
    for (let x = 20; x < 80; x += 1) {
      const index = (y * 120 + x) * 4;
      data[index] = 250;
      data[index + 1] = 250;
      data[index + 2] = 250;
    }
  }

  const result = analyzeOceanPixelsFromRgba(data, 120, 80, {
    sampleStride: 1,
    excludeBottomRatio: 0
  });

  assert.equal(result.pass, false);
  assert.ok(result.largest_near_white_component_px > 500);
  assert.ok(result.blank_tile_rect_count > 0);
});

test("ocean analyzer passes the expected ocean background", () => {
  const result = analyzeOceanPixelsFromRgba(rgba(100, 80, [215, 220, 220]), 100, 80, {
    sampleStride: 1,
    excludeBottomRatio: 0
  });

  assert.equal(result.pass, true);
  assert.equal(result.near_white_ratio, 0);
  assert.equal(result.placeholder_gray_ratio, 0);
});

test("ocean analyzer ignores tiny white label-like artifacts", () => {
  const data = rgba(100, 80, [215, 220, 220]);
  for (let y = 20; y < 24; y += 1) {
    for (let x = 20; x < 24; x += 1) {
      const index = (y * 100 + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
    }
  }

  const result = analyzeOceanPixelsFromRgba(data, 100, 80, {
    sampleStride: 1,
    excludeBottomRatio: 0
  });

  assert.equal(result.pass, true);
  assert.ok(result.near_white_ratio < 0.003);
  assert.ok(result.largest_near_white_component_px <= 500);
});

test("ocean analyzer ignores scattered white labels when no blank component exists", () => {
  const data = rgba(160, 100, [215, 220, 220]);
  for (let y = 10; y < 90; y += 10) {
    for (let x = 10; x < 150; x += 10) {
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const index = ((y + dy) * 160 + x + dx) * 4;
          data[index] = 255;
          data[index + 1] = 255;
          data[index + 2] = 255;
        }
      }
    }
  }

  const result = analyzeOceanPixelsFromRgba(data, 160, 100, {
    sampleStride: 1,
    excludeBottomRatio: 0
  });

  assert.equal(result.pass, true);
  assert.ok(result.near_white_ratio > 0.003);
  assert.ok(result.largest_near_white_component_px <= 500);
});
