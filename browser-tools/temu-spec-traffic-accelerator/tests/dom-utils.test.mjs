import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const domUtilsSource = fs.readFileSync(
  new URL("../content/dom-utils.js", import.meta.url),
  "utf8",
);

function createPage(html) {
  const dom = new JSDOM(html, {
    url: "https://agentseller-eu.temu.com/main/flux-analysis",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent;
    },
  });
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON() {
        return this;
      },
    };
  };
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.eval(domUtilsSource);
  return { dom, window, api: window.TemuAcceleratorDom };
}

test("looks up each site row for a single SKC", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <div>
        <span>商品ID查询</span>
        <input id="searchType" value="SPU" readonly />
        <div id="typeMenu" hidden>
          <div role="option">SKC</div>
          <div role="option">SPU</div>
        </div>
        <input placeholder="多个查询请空格或逗号依次输入" value="" />
        <button id="query">查询</button>
      </div>
      <div>共有 2 条</div>
      <table>
        <tbody id="rows"></tbody>
      </table>
    </body>
  `);

  const typeInput = window.document.querySelector("#searchType");
  const typeMenu = window.document.querySelector("#typeMenu");
  typeInput.addEventListener("click", () => {
    typeMenu.hidden = false;
  });
  window.document
    .querySelector("[role='option']")
    .addEventListener("click", () => {
      typeInput.value = "SKC";
      typeMenu.hidden = true;
    });
  window.document.querySelector("#query").addEventListener("click", () => {
    window.document.querySelector("#rows").innerHTML = `
      <tr>
        <td>SPU ID： 44444444444 经营站点： 德国站</td>
        <td>该商品已获得开启流量加速器机会 立即开启</td>
      </tr>
      <tr>
        <td>SPU ID： 44444444444 经营站点： 法国站</td>
        <td>没有资格</td>
      </tr>
    `;
  });

  const result = await api.lookupSkc("111111111111");
  assert.equal(result.total, 2);
  assert.equal(result.sites["德国站"].status, "ELIGIBLE");
  assert.equal(result.sites["法国站"].status, "NOT_ELIGIBLE");
  assert.equal(result.sites["德国站"].spuId, "44444444444");
  assert.equal(typeInput.value, "SKC");
});

test("waits for a slow SKC query to replace stale result rows", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <div>
        <span>商品ID查询</span>
        <input id="searchType" value="SKC" readonly />
        <input placeholder="多个查询请空格或逗号依次输入" value="" />
        <button id="query">查询</button>
      </div>
      <div id="total">共有 40 条</div>
      <table>
        <tbody id="rows">
          <tr><td>SPU ID： 111 经营站点： 德国站</td></tr>
          <tr><td>SPU ID： 222 经营站点： 法国站</td></tr>
        </tbody>
      </table>
    </body>
  `);

  window.document.querySelector("#query").addEventListener("click", () => {
    window.setTimeout(() => {
      window.document.querySelector("#total").textContent = "共有 2 条";
      window.document.querySelector("#rows").innerHTML = `
        <tr><td>SPU ID： 44444444444 经营站点： 德国站</td></tr>
        <tr><td>SPU ID： 44444444444 经营站点： 法国站</td></tr>
      `;
    }, 6200);
  });

  const result = await api.lookupSkc("666666666666");
  assert.equal(result.total, 2);
  assert.equal(result.sites["德国站"].spuId, "44444444444");
  assert.equal(result.sites["法国站"].spuId, "44444444444");
});

test("recognizes a late result when the same SKC is retried", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <div>
        <span>商品ID查询</span>
        <input id="searchType" value="SKC" readonly />
        <input placeholder="多个查询请空格或逗号依次输入" value="" />
        <button id="query">查询</button>
      </div>
      <div id="total">共有 0 条</div>
      <table>
        <tbody id="rows"></tbody>
      </table>
    </body>
  `);

  let queryCount = 0;
  window.document.querySelector("#query").addEventListener("click", () => {
    queryCount += 1;
    if (queryCount > 1) return;
    window.document.querySelector("#total").textContent = "共有 2 条";
    window.document.querySelector("#rows").innerHTML = `
      <tr><td>SPU ID： 44444444444 经营站点： 德国站</td></tr>
      <tr><td>SPU ID： 44444444444 经营站点： 法国站</td></tr>
    `;
  });

  const first = await api.lookupSkc("555555555555");
  const retried = await api.lookupSkc("555555555555");

  assert.equal(first.total, 2);
  assert.equal(retried.total, 2);
  assert.equal(retried.sites["德国站"].spuId, "44444444444");
  assert.equal(retried.sites["法国站"].spuId, "44444444444");
  assert.equal(queryCount, 2);
});

test("accepts an already displayed result after resuming the same SKC", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <div>
        <span>商品ID查询</span>
        <input id="searchType" value="SKC" readonly />
        <input
          placeholder="多个查询请空格或逗号依次输入"
          value="555555555555"
        />
        <button id="query">查询</button>
      </div>
      <div>共有 2 条</div>
      <table>
        <tbody>
          <tr><td>SPU ID： 44444444444 经营站点： 德国站</td></tr>
          <tr><td>SPU ID： 44444444444 经营站点： 法国站</td></tr>
        </tbody>
      </table>
    </body>
  `);

  const result = await api.lookupSkc("555555555555");
  assert.equal(result.total, 2);
  assert.equal(result.sites["德国站"].spuId, "44444444444");
  assert.equal(result.sites["法国站"].spuId, "44444444444");
});

test("detects every target size and price cap failures", async () => {
  const rowHtml = (sku, reference) => `
    <div class="price-row">
      <span>${sku}</span>
      <input placeholder="请输入" />
      <span>参考申报价格： ¥${reference}</span>
    </div>
  `;
  const { window, api } = createPage(`
    <body>
      <div id="editor">
        <h2>调整申报价</h2>
        ${rowHtml("S-Mixed Color2", "114.25")}
        ${rowHtml("M-Mixed Color2", "114.25")}
        ${rowHtml("S-Mixed Color3", "118.38")}
      </div>
    </body>
  `);

  const editor = window.document.querySelector("#editor");
  const rows = await api.collectPriceRowsWithScrolling(editor, "Mixed Color2");
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.isTarget).length, 2);

  const invalid = api.validatePriceRows(rows, 11500, 12500);
  assert.equal(invalid.failures.length, 3);

  const valid = api.validatePriceRows(rows, 11425, 11838);
  assert.equal(valid.failures.length, 0);
});

test("recognizes localized Chinese mixed-color SKU rows", async () => {
  const sizes = ["S", "M", "L", "XL", "XXL", "XXXL"];
  const { window, api } = createPage(`
    <body>
      <div id="editor">
        <h2>调整申报价</h2>
        ${sizes
          .map(
            (size) => `
              <div class="price-row">
                <span>混合色-${size}</span>
                <input placeholder="请输入" />
                <span>参考申报价格： ¥186.58</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </body>
  `);

  const editor = window.document.querySelector("#editor");
  const rows = await api.collectPriceRowsWithScrolling(editor, "混合色");
  assert.equal(rows.length, 6);
  assert.equal(rows.every((row) => row.isTarget), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.map((row) => row.skuLabel))),
    sizes.map((size) => `混合色-${size}`),
  );
});

test("automatically fills valid prices, confirms, submits and verifies the click path", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <table>
        <tbody>
          <tr id="site-row">
            <td>SPU ID： 44444444444 经营站点： 德国站</td>
            <td>
              该商品已获得开启流量加速器机会
              <a id="open-button">立即开启</a>
            </td>
          </tr>
        </tbody>
      </table>
      <div id="outer-modal" hidden>
        <h2>流量加速器</h2>
        <div>普通流量加权</div>
        <a id="go-get">去获取</a>
        <button id="submit-button">立即加速</button>
        <button>放弃加速机会</button>
      </div>
      <div id="confirmation-modal" hidden>
        <h2>确认选择</h2>
        <button id="final-confirm">确认</button>
        <button>取消</button>
      </div>
      <div id="editor" hidden>
        <h2>调整申报价</h2>
        <div class="price-row">
          <span>S-Mixed Color2</span><input placeholder="请输入" />
          <span>参考申报价格： ¥114.25</span>
        </div>
        <div class="price-row">
          <span>M-Mixed Color2</span><input placeholder="请输入" />
          <span>参考申报价格： ¥114.25</span>
        </div>
        <div class="price-row">
          <span>S-Mixed Color3</span><input placeholder="请输入" />
          <span>参考申报价格： ¥118.38</span>
        </div>
        <button id="confirm-price">确认</button>
      </div>
    </body>
  `);

  window.document.querySelector("#open-button").addEventListener("click", () => {
    window.document.querySelector("#outer-modal").hidden = false;
  });
  window.document.querySelector("#go-get").addEventListener("click", () => {
    window.document.querySelector("#editor").hidden = false;
  });
  window.document
    .querySelector("#confirm-price")
    .addEventListener("click", () => {
      window.document.querySelector("#editor").hidden = true;
    });
  window.document
    .querySelector("#submit-button")
    .addEventListener("click", () => {
      window.document.querySelector("#confirmation-modal").hidden = false;
    });
  window.document
    .querySelector("#final-confirm")
    .addEventListener("click", () => {
      window.document.querySelector("#confirmation-modal").hidden = true;
      window.document.querySelector("#outer-modal").hidden = true;
      window.document.body.dataset.submitted = "yes";
    });

  const result = await api.processSite({
    siteName: "德国站",
    targetColorGroup: "Mixed Color2",
    targetPriceCents: 11425,
    genericPriceCents: 11838,
  });

  assert.equal(result.status, "SUBMITTED");
  assert.equal(window.document.body.dataset.submitted, "yes");
  assert.deepEqual(JSON.parse(JSON.stringify(result.finalPrices)), [
    {
      skuLabel: "S-Mixed Color2",
      price: 114.25,
      priceType: "指定规格",
      referencePrice: 114.25,
    },
    {
      skuLabel: "M-Mixed Color2",
      price: 114.25,
      priceType: "指定规格",
      referencePrice: 114.25,
    },
    {
      skuLabel: "S-Mixed Color3",
      price: 118.38,
      priceType: "通用规格",
      referencePrice: 118.38,
    },
  ]);
  assert.deepEqual(
    [...window.document.querySelectorAll("#editor input")].map(
      (input) => input.value,
    ),
    ["114.25", "114.25", "118.38"],
  );
});

test("skips the whole site when one SKU exceeds its cap", async () => {
  const { window, api } = createPage(`
    <body>
      <div>商品流量 · 欧区</div>
      <table>
        <tbody>
          <tr>
            <td>SPU ID： 44444444444 经营站点： 德国站</td>
            <td>
              该商品已获得开启流量加速器机会
              <a id="open-button">立即开启</a>
            </td>
          </tr>
        </tbody>
      </table>
      <div id="outer-modal" hidden>
        <h2>流量加速器</h2>
        <a id="go-get">去获取</a>
        <button id="submit-button">立即加速</button>
        <button id="abandon-button">放弃加速机会</button>
      </div>
      <div id="editor" hidden>
        <h2>调整申报价</h2>
        <div class="price-row">
          <span>S-Mixed Color2</span><input placeholder="请输入" />
          <span>参考申报价格： ¥114.25</span>
        </div>
        <div class="price-row">
          <span>S-Mixed Color3</span><input placeholder="请输入" />
          <span>参考申报价格： ¥118.38</span>
        </div>
        <button id="cancel-price">取消</button>
      </div>
    </body>
  `);

  window.document.querySelector("#open-button").addEventListener("click", () => {
    window.document.querySelector("#outer-modal").hidden = false;
  });
  window.document.querySelector("#go-get").addEventListener("click", () => {
    window.document.querySelector("#editor").hidden = false;
  });
  window.document
    .querySelector("#cancel-price")
    .addEventListener("click", () => {
      window.document.querySelector("#editor").hidden = true;
    });
  window.document
    .querySelector("#abandon-button")
    .addEventListener("click", () => {
      window.document.querySelector("#outer-modal").hidden = true;
    });
  window.document
    .querySelector("#submit-button")
    .addEventListener("click", () => {
      window.document.body.dataset.submitted = "yes";
    });

  const result = await api.processSite({
    siteName: "德国站",
    targetColorGroup: "Mixed Color2",
    targetPriceCents: 11500,
    genericPriceCents: 12500,
  });

  assert.equal(result.status, "SKIPPED_PRICE_LIMIT");
  assert.equal(result.overLimitSkus.length, 2);
  assert.equal(window.document.body.dataset.submitted, undefined);
});
