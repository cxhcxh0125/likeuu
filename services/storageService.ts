
const DB_NAME = 'ULookFashionDB';
const DB_VERSION = 2; // 升级版本以解决版本冲突
const STORES = {
  WARDROBE: 'wardrobe',
  LOOKS: 'looks'
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // 确保对象存储存在
      if (!db.objectStoreNames.contains(STORES.WARDROBE)) {
        db.createObjectStore(STORES.WARDROBE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.LOOKS)) {
        db.createObjectStore(STORES.LOOKS, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      // 如果版本错误，尝试删除旧数据库并重新创建
      console.warn('[Storage] Failed to open DB, attempting to delete and recreate...');
      indexedDB.deleteDatabase(DB_NAME).onsuccess = () => {
        const retryRequest = indexedDB.open(DB_NAME, DB_VERSION);
        retryRequest.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORES.WARDROBE)) {
            db.createObjectStore(STORES.WARDROBE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORES.LOOKS)) {
            db.createObjectStore(STORES.LOOKS, { keyPath: 'id' });
          }
        };
        retryRequest.onsuccess = () => resolve(retryRequest.result);
        retryRequest.onerror = () => reject(retryRequest.error);
      };
    };
    
    request.onblocked = () => {
      console.warn('[Storage] Database upgrade blocked. Please close other tabs using this database.');
    };
  });
};

export const storage = {
  async getAll(storeName: string): Promise<any[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async save(storeName: string, item: any): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async remove(storeName: string, id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};
