const DATABASE_NAME = "liufeng-workbench-note-images";
const DATABASE_VERSION = 1;
const STORE_NAME = "images";

export const NOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const NOTE_IMAGE_MAX_PER_NOTE = 30;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("图片存储操作失败"));
  });
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("当前浏览器不支持本地图片存储，请升级浏览器后重试"));
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) return;
      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("noteId", "noteId", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地图片存储"));
    request.onblocked = () => reject(new Error("图片存储正在被其他页面占用，请关闭其他工作台页面后重试"));
  });
}

function imageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionForType(type) {
  const subtype = String(type || "").split("/")[1]?.split("+")[0];
  return subtype === "jpeg" ? "jpg" : (subtype || "png");
}

export function extractClipboardImages(clipboardData) {
  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
}

export function validateNoteImage(image) {
  if (!image || !String(image.type || "").startsWith("image/")) {
    throw new Error("剪贴板中没有可保存的图片");
  }
  if (Number(image.size || 0) > NOTE_IMAGE_MAX_BYTES) {
    throw new Error("单张图片不能超过 12 MB");
  }
  return image;
}

export function formatNoteImageSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 102.4) / 10)} KB`;
  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

export async function saveNoteImages(noteId, images) {
  const validImages = Array.from(images || []).map(validateNoteImage);
  if (!noteId || !validImages.length) return [];
  const database = await openDatabase();
  const createdAt = new Date().toISOString();
  const records = validImages.map((blob, index) => ({
    id: imageId(),
    noteId,
    blob,
    name: String(blob.name || `剪贴板图片-${Date.now()}-${index + 1}.${extensionForType(blob.type)}`),
    type: blob.type,
    size: blob.size,
    createdAt,
  }));
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.index("noteId").count(noteId);
      let operationError = null;
      countRequest.onsuccess = () => {
        if (countRequest.result + records.length > NOTE_IMAGE_MAX_PER_NOTE) {
          operationError = new Error(`每条便签最多保存 ${NOTE_IMAGE_MAX_PER_NOTE} 张图片`);
          transaction.abort();
          return;
        }
        records.forEach((record) => store.put(record));
      };
      countRequest.onerror = () => {
        operationError = countRequest.error || new Error("读取图片数量失败");
        transaction.abort();
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(operationError || transaction.error || new Error("图片保存失败"));
      transaction.onabort = () => reject(operationError || transaction.error || new Error("图片保存失败"));
    });
    return records;
  } finally {
    database.close();
  }
}

export async function listNoteImages(noteId) {
  if (!noteId) return [];
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).index("noteId").getAll(noteId));
    return records.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  } finally {
    database.close();
  }
}

export async function deleteNoteImage(imageId) {
  if (!imageId) return;
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(imageId));
  } finally {
    database.close();
  }
}

export async function deleteAllNoteImages(noteId) {
  if (!noteId) return;
  const records = await listNoteImages(noteId);
  if (!records.length) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    records.forEach((record) => store.delete(record.id));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("图片删除失败"));
      transaction.onabort = () => reject(transaction.error || new Error("图片删除失败"));
    });
  } finally {
    database.close();
  }
}
