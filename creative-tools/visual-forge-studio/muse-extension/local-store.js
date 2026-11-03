(function attachLocalStore(root) {
  "use strict";

  const DB_NAME = "visualforge-extension";
  const DB_VERSION = 1;
  let databasePromise = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("jobs")) {
          const jobs = database.createObjectStore("jobs", { keyPath: "id" });
          jobs.createIndex("created_at", "created_at");
        }
        if (!database.objectStoreNames.contains("assets")) {
          const assets = database.createObjectStore("assets", { keyPath: "id" });
          assets.createIndex("job_id", "job_id");
        }
        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地任务库"));
    });
    return databasePromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB 操作失败"));
    });
  }

  async function transaction(storeName, mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("本地数据库事务失败"));
      tx.onabort = () => reject(tx.error || new Error("本地数据库事务已取消"));
    });
  }

  async function getAll(storeName) {
    const database = await openDatabase();
    const tx = database.transaction(storeName, "readonly");
    return requestResult(tx.objectStore(storeName).getAll());
  }

  const api = {
    async putJob(job) {
      await transaction("jobs", "readwrite", (store) => store.put(job));
      return job;
    },
    async getJob(id) {
      const database = await openDatabase();
      const tx = database.transaction("jobs", "readonly");
      const job = await requestResult(tx.objectStore("jobs").get(id));
      if (!job) throw new Error("任务不存在");
      return job;
    },
    async listJobs(limit = 30) {
      const jobs = await getAll("jobs");
      return jobs
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .slice(0, Math.max(1, Math.min(Number(limit) || 30, 100)));
    },
    async putAsset(asset) {
      await transaction("assets", "readwrite", (store) => store.put(asset));
      return asset;
    },
    async getAsset(id) {
      const database = await openDatabase();
      const tx = database.transaction("assets", "readonly");
      return requestResult(tx.objectStore("assets").get(id));
    },
    async listAssets(jobId = null) {
      const assets = await getAll("assets");
      return jobId
        ? assets.filter((asset) => asset.job_id === jobId)
        : assets;
    },
    async deleteAssets(jobId) {
      const assets = await this.listAssets(jobId);
      await transaction("assets", "readwrite", (store) => {
        for (const asset of assets) store.delete(asset.id);
      });
    },
    async setSetting(key, value) {
      await transaction("settings", "readwrite", (store) => store.put({ key, value }));
      return value;
    },
    async getSetting(key, fallback = null) {
      const database = await openDatabase();
      const tx = database.transaction("settings", "readonly");
      const row = await requestResult(tx.objectStore("settings").get(key));
      return row ? row.value : fallback;
    },
    async removeSetting(key) {
      await transaction("settings", "readwrite", (store) => store.delete(key));
    },
    async recoverInterrupted() {
      const jobs = await this.listJobs(100);
      const now = new Date().toISOString();
      const interrupted = jobs.filter((job) => ["queued", "running"].includes(job.status));
      for (const job of interrupted) {
        await this.putJob({
          ...job,
          status: "failed",
          progress: 0,
          error: "扩展重载或浏览器重启，任务已中断，请重新开始",
          message: "任务已中断",
          finished_at: now,
          updated_at: now,
        });
      }
      return interrupted.length;
    },
  };

  root.VisualForgeStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

