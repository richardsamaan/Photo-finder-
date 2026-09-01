import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeExternalUrl } from "./validateUrl.js";

test("rejects localhost", async () => {
  await assert.rejects(() => assertSafeExternalUrl("http://localhost:4000/secret"));
});

test("rejects loopback IP literal", async () => {
  await assert.rejects(() => assertSafeExternalUrl("http://127.0.0.1/admin"));
});

test("rejects private RFC1918 ranges", async () => {
  await assert.rejects(() => assertSafeExternalUrl("http://10.0.0.5/x"));
  await assert.rejects(() => assertSafeExternalUrl("http://192.168.1.1/x"));
  await assert.rejects(() => assertSafeExternalUrl("http://172.16.0.1/x"));
});

test("rejects link-local", async () => {
  await assert.rejects(() => assertSafeExternalUrl("http://169.254.169.254/latest/meta-data"));
});

test("rejects non-http(s) protocols", async () => {
  await assert.rejects(() => assertSafeExternalUrl("file:///etc/passwd"));
  await assert.rejects(() => assertSafeExternalUrl("ftp://example.com/x"));
});

test("accepts a public IP literal over https", async () => {
  const url = await assertSafeExternalUrl("https://93.184.216.34/image.jpg");
  assert.equal(url.protocol, "https:");
});
