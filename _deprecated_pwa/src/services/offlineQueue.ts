/**
 * IndexedDB queue for offline/pending uploads.
 * Stores messages + attachments when offline, flushes on reconnect.
 */

const DB_NAME = 'seedify-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-uploads';

export interface PendingUpload {
  id?: number;
  messages: any[];
  attachments: any[];
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(upload: Omit<PendingUpload, 'id' | 'createdAt'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: PendingUpload = { ...upload, createdAt: Date.now() };
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(): Promise<PendingUpload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function count(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Flush all pending uploads via the provided send function.
 * Removes each item on success, keeps on failure.
 */
export async function flush(
  sendFn: (upload: PendingUpload) => Promise<boolean>
): Promise<{ sent: number; failed: number }> {
  const items = await getAll();
  let sent = 0, failed = 0;
  for (const item of items) {
    try {
      const ok = await sendFn(item);
      if (ok && item.id) {
        await remove(item.id);
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
