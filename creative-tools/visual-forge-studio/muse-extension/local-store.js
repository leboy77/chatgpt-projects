(function attachLocalStore(root) {
  "use strict";

  const DB_NAME = "visualforge-extension";
  const DB_VERSION = 3;
  let databasePromise = null;

  function migrateLegacyTaskGroups(tasksStore) {
    const request = tasksStore.getAll();
    request.onsuccess = () => {
      const groups = new Map();
      for (const task of request.result || []) {
        if (!task.group_id || task.output_count) continue;
        const group = groups.get(task.group_id) || [];
        group.push(task);
        groups.set(task.group_id, group);
      }
      for (const group of groups.values()) {
        const ordered = group.sort((left, right) =>
          String(left.created_at).localeCompare(String(right.created_at)),
        );
        const first = ordered[0];
        const collapsed = {
          id: first.id,
          module: "product_generate",
          base_prompt: first.base_prompt || "",
          prompt_template:
            first.prompt_template ||
            root.VisualForgeCore?.DEFAULT_COPY_PROMPT_TEMPLATE ||
            "",
          output_count: ordered.length,
          main_image: first.main_image,
          sku: first.sku || "",
          engine: first.engine || "muse",
          chain_mode: first.chain_mode || "previous",
          size: first.size || "1024x1024",
          quality: first.quality || "high",
          status: "pending",
          created_at: first.created_at,
          updated_at:
            ordered
              .map((task) => task.updated_at || task.created_at)
              .sort()
              .at(-1) || new Date().toISOString(),
        };
        for (const task of ordered) tasksStore.delete(task.id);
        tasksStore.put(collapsed);
      }
    };
  }

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
        if (!database.objectStoreNames.contains("tasks")) {
          const tasks = database.createObjectStore("tasks", { keyPath: "id" });
          tasks.createIndex("created_at", "created_at");
          tasks.createIndex("group_id", "group_id");
        }
        if (!database.objectStoreNames.contains("prompt_memories")) {
          const memories = database.createObjectStore("prompt_memories", {
            keyPath: "id",
          });
          memories.createIndex("updated_at", "updated_at");
        }
        if (request.oldVersion < 3 && database.objectStoreNames.contains("tasks")) {
          migrateLegacyTaskGroups(request.transaction.objectStore("tasks"));
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
      const tasks = await getAll("tasks");
      for (const task of tasks.filter((item) => item.status === "running")) {
        await this.putTask({
          ...task,
          status: "failed",
          last_finished_at: now,
          updated_at: now,
        });
      }
      return interrupted.length;
    },
    async putTask(task) {
      await transaction("tasks", "readwrite", (store) => store.put(task));
      return task;
    },
    async getTask(id) {
      const database = await openDatabase();
      const tx = database.transaction("tasks", "readonly");
      const task = await requestResult(tx.objectStore("tasks").get(id));
      if (!task) throw new Error("任务配置不存在");
      return task;
    },
    async listTasks() {
      const tasks = await getAll("tasks");
      return tasks.sort(
        (left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
      );
    },
    async deleteTask(id) {
      await transaction("tasks", "readwrite", (store) => store.delete(id));
    },
    async putPromptMemory(memory) {
      await transaction("prompt_memories", "readwrite", (store) =>
        store.put(memory),
      );
      return memory;
    },
    async listPromptMemories(limit = 20) {
      const memories = await getAll("prompt_memories");
      return memories
        .sort((left, right) =>
          String(right.updated_at).localeCompare(String(left.updated_at)),
        )
        .slice(0, Math.max(1, Math.min(Number(limit) || 20, 50)));
    },
    async deletePromptMemory(id) {
      await transaction("prompt_memories", "readwrite", (store) =>
        store.delete(id),
      );
    },
    async prunePromptMemories(maximum = 20) {
      const memories = await getAll("prompt_memories");
      const keep = Math.max(1, Math.min(Number(maximum) || 20, 50));
      const stale = memories
        .sort((left, right) =>
          String(right.updated_at).localeCompare(String(left.updated_at)),
        )
        .slice(keep);
      if (!stale.length) return 0;
      await transaction("prompt_memories", "readwrite", (store) => {
        for (const memory of stale) store.delete(memory.id);
      });
      return stale.length;
    },
  };

  root.VisualForgeStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

