import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFinalPriceRows,
  formatFinalPriceDetails,
} from "../lib/result-export.js";

test("formats and exports every submitted SKU final price", () => {
  const tasks = [
    {
      skcId: "555555555555",
      spuId: "44444444444",
      siteName: "德国站",
      status: "ACTIVE",
      details: {
        finalPrices: [
          {
            skuLabel: "S-Mixed Color2",
            price: 110,
            priceType: "指定规格",
            referencePrice: 114.25,
          },
          {
            skuLabel: "S-Mixed Color3",
            price: 115,
            priceType: "通用规格",
            referencePrice: 118.38,
          },
        ],
      },
    },
  ];

  assert.equal(
    formatFinalPriceDetails(tasks[0].details.finalPrices),
    "S-Mixed Color2=110.00; S-Mixed Color3=115.00",
  );
  assert.deepEqual(
    buildFinalPriceRows(
      tasks,
      "2026-11-20T07:30:00.000Z",
      (status) => (status === "ACTIVE" ? "已加速" : status),
    ),
    [
      [
        "555555555555",
        "44444444444",
        "德国站",
        "S-Mixed Color2",
        "指定规格",
        110,
        114.25,
        "已加速",
        "2026-11-20T07:30:00.000Z",
      ],
      [
        "555555555555",
        "44444444444",
        "德国站",
        "S-Mixed Color3",
        "通用规格",
        115,
        118.38,
        "已加速",
        "2026-11-20T07:30:00.000Z",
      ],
    ],
  );
});
