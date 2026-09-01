import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { persistImageBuffer, categoryDir, resolveStoragePath } from "./imageStorage.js";

const TEST_JOB_ID = "job_test-fixture";

test("persistImageBuffer stores STYLECODE-COLOUR.jpg under Product_Catalog/<Category>/", async () => {
  // A real 4x4 red PNG generated in-memory - stands in for a "downloaded" image
  // without requiring network access (network calls are validated separately
  // via lib/validateUrl.test.ts and the provider adapters' own HTTP layer).
  const pngBuffer = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 20, b: 20 } },
  })
    .png()
    .toBuffer();

  const result = await persistImageBuffer({
    jobId: TEST_JOB_ID,
    category: "T-Shirt",
    styleCode: "50512345",
    colour: "Black",
    buffer: pngBuffer,
  });

  assert.ok(fs.existsSync(result.localPath));
  assert.equal(result.localPath.endsWith("50512345-Black.jpg"), true);
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);

  const dir = categoryDir(TEST_JOB_ID, "T-Shirt");
  assert.ok(dir.includes("Product_Catalog"));
  assert.ok(dir.endsWith("T-Shirt"));

  // Round-trip: file is a real, decodable JPEG
  const meta = await sharp(fs.readFileSync(result.localPath)).metadata();
  assert.equal(meta.format, "jpeg");

  // cleanup
  fs.rmSync(resolveStoragePath(`catalog/${TEST_JOB_ID}`), { recursive: true, force: true });
});

test("persistImageBuffer sanitizes an unsafe category name into a folder", async () => {
  const pngBuffer = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const result = await persistImageBuffer({
    jobId: TEST_JOB_ID,
    category: "../../etc",
    styleCode: "999",
    colour: "Red",
    buffer: pngBuffer,
  });

  assert.ok(fs.existsSync(result.localPath));
  assert.ok(!result.relativePath.includes(".."));

  fs.rmSync(resolveStoragePath(`catalog/${TEST_JOB_ID}`), { recursive: true, force: true });
});
