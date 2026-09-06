import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractClipboardImages, formatNoteImageSize, NOTE_IMAGE_MAX_BYTES, validateNoteImage } from "../dashboard/note-image-store.js";

test("extractClipboardImages only returns pasted image files", () => {
  const png = { name: "screen.png", type: "image/png", size: 2048 };
  const result = extractClipboardImages({ items: [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "application/pdf", getAsFile: () => ({ type: "application/pdf" }) },
    { kind: "file", type: "image/png", getAsFile: () => png },
  ] });
  assert.deepEqual(result, [png]);
});

test("validateNoteImage rejects non-images and oversized images", () => {
  assert.throws(() => validateNoteImage({ type: "text/plain", size: 20 }), /没有可保存的图片/);
  assert.throws(() => validateNoteImage({ type: "image/png", size: NOTE_IMAGE_MAX_BYTES + 1 }), /12 MB/);
  assert.equal(validateNoteImage({ type: "image/webp", size: 10 }).type, "image/webp");
});

test("formatNoteImageSize produces compact readable labels", () => {
  assert.equal(formatNoteImageSize(512), "512 B");
  assert.equal(formatNoteImageSize(1536), "1.5 KB");
  assert.equal(formatNoteImageSize(2 * 1024 * 1024), "2 MB");
});

test("notes module wires paste, unified vertical scrolling, copying, preview and deletion", async () => {
  const source = await readFile(new URL("../dashboard/main.jsx", import.meta.url), "utf8");
  assert.match(source, /onPaste=\{handleNotePaste\}/);
  assert.match(source, /navigator\.clipboard\.read/);
  assert.match(source, /saveNoteImages\(active\.id, images\)/);
  assert.match(source, /NoteImagePreviewDialog/);
  assert.match(source, /navigator\.clipboard\.write/);
  assert.match(source, /new window\.ClipboardItem/);
  assert.match(source, /note-editor-content \$\{imagePreviews\.length \? "has-images"/);
  assert.match(source, /便签正文与图片，可上下滚动/);
  assert.match(source, /与正文一起上下滚动/);
  assert.doesNotMatch(source, /handleImageWheel|scrollImages\(/);
  assert.match(source, /复制图片/);
  assert.match(source, /deleteNoteImage\(image\.id\)/);
  assert.match(source, /仅保存在当前设备/);
});
