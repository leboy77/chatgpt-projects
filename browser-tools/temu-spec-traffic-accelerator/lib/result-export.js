export function formatFinalPriceDetails(finalPrices) {
  if (!Array.isArray(finalPrices) || !finalPrices.length) return "";
  return finalPrices
    .map((item) => `${item.skuLabel}=${Number(item.price).toFixed(2)}`)
    .join("; ");
}

export function buildFinalPriceRows(
  tasks,
  exportedAt,
  statusLabel = (status) => status,
) {
  const rows = [];
  for (const task of tasks) {
    const finalPrices = task.details?.finalPrices;
    if (!Array.isArray(finalPrices)) continue;
    for (const item of finalPrices) {
      rows.push([
        task.skcId,
        task.spuId || "",
        task.siteName,
        item.skuLabel,
        item.priceType || "",
        Number(item.price),
        item.referencePrice ?? "",
        statusLabel(task.status),
        exportedAt,
      ]);
    }
  }
  return rows;
}
