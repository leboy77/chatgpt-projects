(function attachLocalJobs(root) {
  "use strict";

  const core = root.VisualForgeCore;
  const store = root.VisualForgeStore;
  const archive = root.VisualForgeArchive;
  const model = root.VisualForgeModel;

  function now() {
    return new Date().toISOString();
  }

  function newId() {
    return crypto.randomUUID().replaceAll("-", "");
  }

  function fileAsAsset(file, variantType = "source") {
    return {
      blob: file,
      name: file.name,
      width: 0,
      height: 0,
      variant_type: variantType,
      display: false,
    };
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function manifestCsv(manifest) {
    const fields = [
      "name",
      "source",
      "color",
      "direction",
      "prompt",
      "delta_e",
      "qa_status",
      "coverage",
      "variant_type",
      "muse_delta_e",
      "sha256",
    ];
    const rows = [fields.join(",")];
    for (const output of manifest.outputs || []) {
      rows.push(fields.map((field) => csvEscape(output[field])).join(","));
    }
    return `\uFEFF${rows.join("\r\n")}`;
  }

  async function sha256(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function assetRecord(jobId, asset, index) {
    const id = `${jobId}-${String(index).padStart(3, "0")}-${newId().slice(0, 8)}`;
    const blob = asset.blob;
    let width = asset.width || 0;
    let height = asset.height || 0;
    let thumbnail = null;
    if (blob.type.startsWith("image/")) {
      try {
        if (!width || !height) {
          const source = await core.decode(blob);
          width = source.width;
          height = source.height;
        }
        thumbnail = await core.makeThumbnail(blob);
      } catch {
        // Metadata remains usable even if a browser cannot decode a thumbnail.
      }
    }
    const record = {
      id,
      job_id: jobId,
      name: asset.name,
      type: blob.type,
      size: blob.size,
      width,
      height,
      sha256: await sha256(blob),
      variant_type: asset.variant_type || "output",
      display: asset.display !== false,
      color: asset.color || null,
      color_name: asset.color_name || null,
      source: asset.source || null,
      direction: asset.direction || null,
      prompt: asset.prompt || null,
      delta_e: asset.delta_e,
      muse_delta_e: asset.muse_delta_e,
      qa_status: asset.qa_status,
      coverage: asset.coverage,
      mask_source: asset.mask_source,
      background_mode: asset.background_mode,
      reference_index: asset.reference_index,
      blob,
    };
    await store.putAsset(record);
    const { blob: ignoredBlob, ...publicRecord } = record;
    void ignoredBlob;
    publicRecord.thumbnail = thumbnail;
    return publicRecord;
  }

  async function writeManifest(job, metadata, outputs) {
    const manifest = {
      job_id: job.id,
      kind: job.kind,
      metadata,
      outputs: outputs.map(({ thumbnail, id, job_id, type, size, display, ...rest }) => {
        void thumbnail;
        void id;
        void job_id;
        void type;
        void size;
        void display;
        return rest;
      }),
      notes: "所有图片、CSV 和 JSON 清单均由 Visual Forge 扩展在浏览器内生成。",
    };
    const jsonBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const csvBlob = new Blob([manifestCsv(manifest)], {
      type: "text/csv;charset=utf-8",
    });
    return [
      await assetRecord(job.id, {
        blob: jsonBlob,
        name: "manifest.json",
        variant_type: "manifest",
        display: false,
      }, outputs.length + 1),
      await assetRecord(job.id, {
        blob: csvBlob,
        name: "manifest.csv",
        variant_type: "manifest_csv",
        display: false,
      }, outputs.length + 2),
    ];
  }

  async function update(jobId, values) {
    const existing = await store.getJob(jobId);
    const next = { ...existing, ...values, updated_at: now() };
    await store.putJob(next);
    return next;
  }

  async function runJob(jobId, files, control = {}) {
    let job = await update(jobId, {
      status: "running",
      progress: 1,
      message: "任务执行中",
      started_at: now(),
      error: null,
      attempts: 1,
    });
    const progress = async (value, message) => {
      job = await update(jobId, {
        progress: Math.max(0, Math.min(100, Math.round(value))),
        message,
      });
      control.onUpdate?.(job);
    };
    try {
      const options = job.options || {};
      let processed;
      let sourceAsset = null;
      if (job.kind === "logo_recolor") {
        if (files.length !== 1) throw new Error("单 Logo 多色任务只能上传 1 个 Logo");
        const colors = core.normalizeColors(options.colors, 30);
        processed = {
          outputs: await core.recolorLogo(files[0], colors, options, progress),
          metadata: {
            mode: "one_logo_many_colors",
            source: files[0].name,
            colors,
          },
        };
        sourceAsset = fileAsAsset(files[0]);
      } else if (job.kind === "logo_color_batch") {
        if (!files.length) throw new Error("至少需要 1 个 Logo");
        if (files.length > 100) throw new Error("单次任务最多处理 100 个 Logo");
        const color = core.normalizeColor(options.color);
        const outputs = [];
        const failures = [];
        for (let index = 0; index < files.length; index += 1) {
          await control.waitIfPaused?.();
          try {
            const result = await core.recolorLogo(files[index], [color], options);
            outputs.push(...result);
          } catch (error) {
            failures.push({ source: files[index].name, error: error.message });
          }
          await progress(Math.round(((index + 1) / files.length) * 95), `已处理 Logo ${index + 1}/${files.length}`);
        }
        if (!outputs.length) throw new Error("所有 Logo 均处理失败，请检查源文件");
        processed = {
          outputs,
          metadata: { mode: "many_logos_one_color", color, source_count: files.length, failures },
        };
        sourceAsset = fileAsAsset(files[0]);
      } else if (job.kind === "product_generate") {
        const provider = await model.createProvider();
        processed = await core.buildProductVariants(
          options,
          provider,
          progress,
          control.waitIfPaused,
        );
      } else if (job.kind === "product_color_finalize") {
        if (files.length < 2) throw new Error("商品配色需要主图和至少一张 Muse 生成图");
        const master = files[0];
        const mask = files.slice(1).find((file) => file.name.startsWith("__mask__")) || null;
        const variants = files.slice(1).filter((file) => file !== mask);
        const colors = core.normalizeProductColors(options.colors);
        if (variants.length !== colors.length) {
          throw new Error(`生成图数量 ${variants.length} 与色号数量 ${colors.length} 不一致`);
        }
        processed = await core.finalizeProductColors(
          master,
          variants,
          mask,
          colors,
          options,
          progress,
        );
        sourceAsset = fileAsAsset(master);
      } else if (job.kind === "pattern_batch_finalize") {
        if (files.length < 2) throw new Error("印花套图需要白底商品图和至少一张生成图");
        const references = options.references;
        if (!Array.isArray(references)) throw new Error("references 必须是参考图信息数组");
        processed = await core.finalizePatternBatch(
          files[0],
          files.slice(1),
          references,
          options,
          progress,
        );
        sourceAsset = fileAsAsset(files[0]);
      } else {
        throw new Error(`未知任务类型：${job.kind}`);
      }

      const allAssets = [
        ...(sourceAsset ? [sourceAsset] : []),
        ...processed.outputs,
      ];
      const records = [];
      for (let index = 0; index < allAssets.length; index += 1) {
        records.push(await assetRecord(jobId, allAssets[index], index + 1));
      }
      const manifestRecords = await writeManifest(job, processed.metadata, records);
      records.push(...manifestRecords);

      const qa =
        processed.metadata?.qa ||
        {
          pass: records.filter((item) => item.qa_status === "pass").length,
          review: records.filter((item) => item.qa_status === "review").length,
          retry: records.filter((item) => item.qa_status === "retry").length,
        };
      const message =
        job.kind === "product_color_finalize"
          ? `已输出 ${qa.pass + qa.review + qa.retry} 个颜色，通过 ${qa.pass}，复核 ${qa.review}，需重试 ${qa.retry}`
          : `已完成，共 ${records.filter((item) => item.display && item.type.startsWith("image/")).length} 张图片`;
      job = await update(jobId, {
        progress: 98,
        message: "生成完成，正在归档",
        outputs: records,
      });

      let exportPath = null;
      let archiveError = null;
      let archiveOptions = job.options;
      try {
        const storedAssets = await store.listAssets(jobId);
        const archived = await archive.archiveJob(job, storedAssets);
        exportPath = archived.path;
        archiveOptions = {
          ...job.options,
          archive_group_name:
            job.options?.archive_group_name || archived.groupName,
        };
      } catch (error) {
        archiveError = error.message;
      }
      job = await update(jobId, {
        status: "succeeded",
        progress: 100,
        message: archiveError
          ? `${message}；自动归档未完成`
          : message,
        options: archiveOptions,
        export_path: exportPath,
        archive_error: archiveError,
        finished_at: now(),
        error: null,
      });
      control.onUpdate?.(job);
      return job;
    } catch (error) {
      job = await update(jobId, {
        status: "failed",
        progress: 0,
        message: "任务失败",
        error: error.message || String(error),
        finished_at: now(),
      });
      control.onUpdate?.(job);
      return job;
    }
  }

  async function create(kind, options, files, control = {}) {
    const id = newId();
    const createdAt = now();
    const job = {
      id,
      kind,
      status: "queued",
      progress: 0,
      message: "等待执行",
      options: {
        ...options,
        archive_group_name: options.archive_group_name || null,
      },
      outputs: [],
      error: null,
      archive_error: null,
      export_path: null,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: null,
      finished_at: null,
      attempts: 0,
    };
    await store.putJob(job);
    setTimeout(() => {
      void runJob(id, [...files], control);
    }, 0);
    return job;
  }

  async function get(id) {
    return store.getJob(id);
  }

  async function list(limit = 12) {
    return store.listJobs(limit);
  }

  async function exportJob(id, interactive = false) {
    const job = await store.getJob(id);
    if (job.status !== "succeeded") throw new Error("任务尚未完成");
    await archive.ensurePermission(interactive);
    const assets = await store.listAssets(id);
    const archived = await archive.archiveJob(job, assets);
    return update(id, {
      options: {
        ...job.options,
        archive_group_name:
          job.options?.archive_group_name || archived.groupName,
      },
      export_path: archived.path,
      archive_error: null,
    });
  }

  async function makeZip(id) {
    const job = await store.getJob(id);
    if (job.status !== "succeeded") throw new Error("任务尚未完成");
    const assets = await store.listAssets(id);
    const files = assets.map(
      (asset) => new File([asset.blob], asset.name, { type: asset.type }),
    );
    return root.VisualForgeZip.createZip(files);
  }

  root.VisualForgeJobs = {
    create,
    exportJob,
    get,
    list,
    makeZip,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
