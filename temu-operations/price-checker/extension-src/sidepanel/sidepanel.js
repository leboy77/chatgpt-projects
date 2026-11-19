import {
  countryRowExplicitlyDisabled,
  countryRowHasRmbPrice,
  shouldImportCountryRow,
} from "../shared/countries.mjs";
import { parseSkcRows, splitIdList } from "../shared/skc.mjs";
import {
  ComparisonPolicy,
  PriceCurrency,
  convertCurrencyCentsToRmbCents,
  convertRmbCentsToCurrencyCents,
  toCents,
} from "../shared/pricing.mjs";
import { parseWorkbookFile } from "../shared/xlsx-reader.mjs";

const COUNTRIES = [
  { code: "US", name: "美国", hint: "RMB", group: "美国" },
  { code: "DE", name: "德国", hint: "RMB", group: "欧盟" },
  { code: "FR", name: "法国", hint: "RMB", group: "欧盟" },
  { code: "IT", name: "意大利", hint: "RMB", group: "欧盟" },
  { code: "NL", name: "荷兰", hint: "RMB", group: "欧盟" },
  { code: "ES", name: "西班牙", hint: "RMB", group: "欧盟" },
  { code: "PT", name: "葡萄牙", hint: "RMB", group: "欧盟" },
  { code: "PL", name: "波兰", hint: "RMB", group: "欧盟" },
  { code: "SE", name: "瑞典", hint: "RMB", group: "欧盟" },
  { code: "GR", name: "希腊", hint: "RMB", group: "欧盟" },
  { code: "IE", name: "爱尔兰", hint: "RMB", group: "欧盟" },
  { code: "CY", name: "塞浦路斯", hint: "RMB", group: "欧盟" },
  { code: "BG", name: "保加利亚", hint: "RMB", group: "欧盟" },
  { code: "CZ", name: "捷克", hint: "RMB", group: "欧盟" },
  { code: "HU", name: "匈牙利", hint: "RMB", group: "欧盟" },
  { code: "DK", name: "丹麦", hint: "RMB", group: "欧盟" },
  { code: "RO", name: "罗马尼亚", hint: "RMB", group: "欧盟" },
  { code: "BE", name: "比利时", hint: "RMB", group: "欧盟" },
  { code: "AT", name: "奥地利", hint: "RMB", group: "欧盟" },
  { code: "FI", name: "芬兰", hint: "RMB", group: "欧盟" },
  { code: "SK", name: "斯洛伐克", hint: "RMB", group: "欧盟" },
  { code: "HR", name: "克罗地亚", hint: "RMB", group: "欧盟" },
  { code: "SI", name: "斯洛文尼亚", hint: "RMB", group: "欧盟" },
  { code: "LT", name: "立陶宛", hint: "RMB", group: "欧盟" },
  { code: "EE", name: "爱沙尼亚", hint: "RMB", group: "欧盟" },
  { code: "LV", name: "拉脱维亚", hint: "RMB", group: "欧盟" },
  { code: "MT", name: "马耳他", hint: "RMB", group: "欧盟" },
  { code: "LU", name: "卢森堡", hint: "RMB", group: "欧盟" },
  { code: "CA", name: "加拿大", hint: "RMB", group: "其他站点" },
  { code: "GB", name: "英国", hint: "RMB", group: "其他站点" },
  { code: "AU", name: "澳大利亚", hint: "RMB", group: "其他站点" },
  { code: "NZ", name: "新西兰", hint: "RMB", group: "其他站点" },
  { code: "MX", name: "墨西哥", hint: "RMB", group: "其他站点" },
  { code: "CH", name: "瑞士", hint: "RMB", group: "其他站点" },
  { code: "JP", name: "日本", hint: "RMB", group: "其他站点" },
  { code: "SA", name: "沙特", hint: "RMB", group: "其他站点" },
  { code: "AE", name: "阿联酋", hint: "RMB", group: "其他站点" },
  { code: "KW", name: "科威特", hint: "RMB", group: "其他站点" },
  { code: "IN", name: "印度", hint: "RMB", group: "其他站点" },
  { code: "JO", name: "约旦", hint: "RMB", group: "其他站点" },
  { code: "MY", name: "马来西亚", hint: "RMB", group: "其他站点" },
  { code: "PH", name: "菲律宾", hint: "RMB", group: "其他站点" },
  { code: "TH", name: "泰国", hint: "RMB", group: "其他站点" },
  { code: "QA", name: "卡塔尔", hint: "RMB", group: "其他站点" },
  { code: "OM", name: "阿曼", hint: "RMB", group: "其他站点" },
  { code: "BH", name: "巴林", hint: "RMB", group: "其他站点" },
  { code: "IL", name: "以色列", hint: "RMB", group: "其他站点" },
  { code: "ZA", name: "南非", hint: "RMB", group: "其他站点" },
  { code: "RS", name: "塞尔维亚", hint: "RMB", group: "其他站点" },
  { code: "MD", name: "摩尔多瓦", hint: "RMB", group: "其他站点" },
  { code: "ME", name: "黑山", hint: "RMB", group: "其他站点" },
  { code: "IS", name: "冰岛", hint: "RMB", group: "其他站点" },
  { code: "BA", name: "波黑", hint: "RMB", group: "其他站点" },
  { code: "AL", name: "阿尔巴尼亚", hint: "RMB", group: "其他站点" },
  { code: "PE", name: "秘鲁", hint: "RMB", group: "其他站点" },
  { code: "CO", name: "哥伦比亚", hint: "RMB", group: "其他站点" },
  { code: "GE", name: "格鲁吉亚", hint: "RMB", group: "其他站点" },
  { code: "AM", name: "亚美尼亚", hint: "RMB", group: "其他站点" },
  { code: "AZ", name: "阿塞拜疆", hint: "RMB", group: "其他站点" },
];

const STORAGE_KEY = "temuPricingAssistantStateV1";
const PROFILES_KEY = "temuPricingProfilesV1";
const HISTORY_KEY = "temuPricingJobHistoryV1";
const RULE_VERSION = 3;
const MAX_SKC = 1000;
const BATCH_SIZE = 50;

const elements = {
  globalStatus: document.querySelector("#global-status"),
  downloadTemplate: document.querySelector("#download-template"),
  fileInput: document.querySelector("#file-input"),
  fileName: document.querySelector("#file-name"),
  productCode: document.querySelector("#product-code"),
  pastedSkc: document.querySelector("#pasted-skc"),
  importPasted: document.querySelector("#import-pasted"),
  importSummary: document.querySelector("#import-summary"),
  validCount: document.querySelector("#valid-count"),
  batchCount: document.querySelector("#batch-count"),
  duplicateCount: document.querySelector("#duplicate-count"),
  importedCountryCount: document.querySelector("#imported-country-count"),
  importedCountryTableWrap: document.querySelector("#imported-country-table-wrap"),
  importedCountryTableBody: document.querySelector("#imported-country-table-body"),
  importedCountryEmpty: document.querySelector("#imported-country-empty"),
  importedPriceHeader: document.querySelector("#imported-price-header"),
  issueList: document.querySelector("#issue-list"),
  countryImportNote: document.querySelector("#country-import-note"),
  countrySection: document.querySelector("#country-section"),
  priceSection: document.querySelector("#price-section"),
  countryList: document.querySelector("#country-list"),
  priceList: document.querySelector("#price-list"),
  selectedCountryCount: document.querySelector("#selected-country-count"),
  toPrice: document.querySelector("#to-price"),
  backToCountries: document.querySelector("#back-to-countries"),
  inputCurrency: document.querySelector("#input-currency"),
  fxRateField: document.querySelector("#fx-rate-field"),
  fxRate: document.querySelector("#fx-rate"),
  currencyNote: document.querySelector("#currency-note"),
  comparisonPolicy: document.querySelector("#comparison-policy"),
  lowPricePolicy: document.querySelector("#low-price-policy"),
  previewOnly: document.querySelector("#preview-only"),
  forceReprocess: document.querySelector("#force-reprocess"),
  profileName: document.querySelector("#profile-name"),
  profileSelect: document.querySelector("#profile-select"),
  saveProfile: document.querySelector("#save-profile"),
  loadProfile: document.querySelector("#load-profile"),
  deleteProfile: document.querySelector("#delete-profile"),
  lockCurrentTab: document.querySelector("#lock-current-tab"),
  unlockTab: document.querySelector("#unlock-tab"),
  lockedTabStatus: document.querySelector("#locked-tab-status"),
  inspectPage: document.querySelector("#inspect-page"),
  startAutomation: document.querySelector("#start-automation"),
  stopAutomation: document.querySelector("#stop-automation"),
  diagnosticUrl: document.querySelector("#diagnostic-url"),
  diagnosticLogin: document.querySelector("#diagnostic-login"),
  diagnosticFilters: document.querySelector("#diagnostic-filters"),
  diagnosticDialog: document.querySelector("#diagnostic-dialog"),
  activeBatchLabel: document.querySelector("#active-batch-label"),
  batchGrid: document.querySelector("#batch-grid"),
  reviewEmpty: document.querySelector("#review-empty"),
  reviewSummary: document.querySelector("#review-summary"),
  approvedCount: document.querySelector("#approved-count"),
  excludedCount: document.querySelector("#excluded-count"),
  submittedCount: document.querySelector("#submitted-count"),
  reviewTableWrap: document.querySelector("#review-table-wrap"),
  reviewTableBody: document.querySelector("#review-table-body"),
  platformPriceHeader: document.querySelector("#platform-price-header"),
  targetPriceHeader: document.querySelector("#target-price-header"),
  submitPriceHeader: document.querySelector("#submit-price-header"),
  jobHistory: document.querySelector("#job-history"),
  retryLastJob: document.querySelector("#retry-last-job"),
};

const state = {
  rawRows: [],
  result: null,
  productCode: "",
  selectedCountries: {},
  inputCurrency: PriceCurrency.RMB,
  fxRateToRmb: "",
  comparisonPolicy: ComparisonPolicy.GREATER_OR_EQUAL,
  lowPricePolicy: "REPRICE",
  activeBatch: 1,
  automationRunning: false,
  lockedTab: null,
  latestJob: null,
  history: [],
};

function showStatus(message, tone = "info") {
  elements.globalStatus.textContent = message;
  elements.globalStatus.dataset.tone = tone;
}

function renderCountries() {
  const fragment = document.createDocumentFragment();
  let previousGroup = null;
  for (const country of COUNTRIES) {
    if (country.group !== previousGroup) {
      const groupLabel = document.createElement("div");
      groupLabel.className = "country-group-label";
      groupLabel.textContent = country.group;
      fragment.append(groupLabel);
      previousGroup = country.group;
    }
    const row = document.createElement("div");
    row.className = "country-row";

    const label = document.createElement("label");
    label.className = "country-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.countryCode = country.code;
    checkbox.id = `country-${country.code}`;
    const text = document.createElement("span");
    text.textContent = `${country.name} · ${country.hint}`;
    label.append(checkbox, text);

    checkbox.addEventListener("change", () => {
      const previous = state.selectedCountries[country.code] || {};
      state.selectedCountries[country.code] = {
        code: country.code,
        name: country.name,
        selected: checkbox.checked,
        floorRmb: previous.floorRmb || "",
        submitRmb: previous.submitRmb || "",
        submissionMode: previous.submissionMode,
      };
      renderPriceFields();
      updateActionState();
      persistState();
    });

    row.append(label);
    fragment.append(row);
  }
  elements.countryList.append(fragment);
  renderPriceFields();
}

function getSelectedCheckboxCountries() {
  return COUNTRIES.filter((country) =>
    elements.countryList.querySelector(
      `[data-country-code="${country.code}"]`,
    )?.checked,
  );
}

function currencyConfigValid() {
  if (state.inputCurrency === PriceCurrency.RMB) {
    return true;
  }
  const rate = Number(state.fxRateToRmb);
  return state.inputCurrency === PriceCurrency.USD && Number.isFinite(rate) && rate > 0;
}

function inputAmountFromRmbCents(rmbCents) {
  if (!Number.isInteger(rmbCents) || rmbCents <= 0) {
    return "";
  }
  if (!currencyConfigValid()) {
    return "";
  }
  const displayCents = convertRmbCentsToCurrencyCents(
    rmbCents,
    state.inputCurrency,
    state.fxRateToRmb,
  );
  return (displayCents / 100).toFixed(2);
}

function rmbCentsFromInputAmount(value) {
  if (!String(value ?? "").trim()) {
    return null;
  }
  return convertCurrencyCentsToRmbCents(
    toCents(value),
    state.inputCurrency,
    state.fxRateToRmb,
  );
}

function rmbCentsFromPriceInput(input) {
  if (!input) {
    return null;
  }
  const savedRmbCents = Number(input.dataset.rmbCents);
  if (
    input.dataset.displayValue === input.value &&
    Number.isInteger(savedRmbCents) &&
    savedRmbCents > 0
  ) {
    return savedRmbCents;
  }
  return rmbCentsFromInputAmount(input.value);
}

function sourceRmbCents(saved, field) {
  const centsField = field === "floor" ? "floorRmbCents" : "submitRmbCents";
  if (Number.isInteger(saved?.[centsField])) {
    return saved[centsField];
  }
  const legacyField = field === "floor" ? "floorRmb" : "submitRmb";
  if (!String(saved?.[legacyField] ?? "").trim()) {
    return null;
  }
  try {
    return toCents(saved[legacyField]);
  } catch {
    return null;
  }
}

function updateCurrencyControls() {
  elements.inputCurrency.value = state.inputCurrency;
  elements.fxRate.value = String(state.fxRateToRmb ?? "");
  elements.fxRateField.hidden = state.inputCurrency !== PriceCurrency.USD;
  const currency = state.inputCurrency === PriceCurrency.USD ? "USD" : "RMB";
  elements.platformPriceHeader.textContent = `平台价 ${currency}`;
  elements.targetPriceHeader.textContent = `申报价 ${currency}`;
  elements.submitPriceHeader.textContent = `还价目标 ${currency}`;
  elements.currencyNote.textContent =
    state.inputCurrency === PriceCurrency.USD
      ? "Excel 按人民币读取；填写汇率后统一换算为美元显示，提交时再换算回 Temu 的人民币价格。"
      : "Excel 按人民币读取；人民币模式不需要汇率。";
  elements.importedPriceHeader.textContent = `显示申报价 ${currency}`;
  renderImportedCountries();
}

function renderImportedCountries() {
  const imported = Object.values(state.selectedCountries)
    .filter((country) => country?.selected && country.source === "excel")
    .sort(
      (left, right) =>
        COUNTRIES.findIndex((country) => country.code === left.code) -
        COUNTRIES.findIndex((country) => country.code === right.code),
    );
  elements.importedCountryCount.textContent = String(imported.length);
  elements.importedCountryEmpty.hidden = imported.length > 0;
  elements.importedCountryTableWrap.hidden = imported.length === 0;
  elements.importedCountryTableBody.replaceChildren();
  for (const country of imported) {
    const floorRmbCents = sourceRmbCents(country, "floor");
    const submitRmbCents =
      sourceRmbCents(country, "submit") ?? floorRmbCents;
    const tr = document.createElement("tr");
    const values = [
      `${country.name}（${country.code}）`,
      Number.isInteger(floorRmbCents)
        ? (floorRmbCents / 100).toFixed(2)
        : "",
      inputAmountFromRmbCents(floorRmbCents) || "待填写汇率",
      Number.isInteger(submitRmbCents)
        ? (submitRmbCents / 100).toFixed(2)
        : "",
    ];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    elements.importedCountryTableBody.append(tr);
  }
}

function renderPriceFields() {
  const selected = getSelectedCheckboxCountries();
  elements.priceList.replaceChildren();
  const displayCurrency =
    state.inputCurrency === PriceCurrency.USD ? "USD" : "RMB";
  elements.selectedCountryCount.textContent =
    `已选择 ${selected.length} 个站点，价格单位为 ${displayCurrency}。`;
  elements.toPrice.disabled = selected.length === 0;

  for (const country of selected) {
    const saved = state.selectedCountries[country.code] || {};
    const row = document.createElement("div");
    row.className = "price-row";
    const label = document.createElement("span");
    label.textContent = `${country.name} · ${displayCurrency}`;
    const floorField = document.createElement("label");
    floorField.className = "price-field";
    const floorLabel = document.createElement("span");
    floorLabel.textContent = "申报价";
    const price = document.createElement("input");
    price.className = "country-price";
    price.type = "text";
    price.inputMode = "decimal";
    price.placeholder = displayCurrency;
    price.value = inputAmountFromRmbCents(sourceRmbCents(saved, "floor"));
    price.dataset.rmbCents = String(sourceRmbCents(saved, "floor") ?? "");
    price.dataset.displayValue = price.value;
    price.dataset.countryPrice = country.code;
    price.setAttribute("aria-label", `${country.name}申报价 ${displayCurrency}`);
    floorField.append(floorLabel, price);

    const submitField = document.createElement("label");
    submitField.className = "price-field";
    const submitLabel = document.createElement("span");
    submitLabel.textContent = "还价目标";
    const submitPrice = document.createElement("input");
    submitPrice.className = "country-price";
    submitPrice.type = "text";
    submitPrice.inputMode = "decimal";
    submitPrice.placeholder = "同申报价";
    submitPrice.value = inputAmountFromRmbCents(sourceRmbCents(saved, "submit"));
    submitPrice.dataset.rmbCents = String(
      sourceRmbCents(saved, "submit") ?? "",
    );
    submitPrice.dataset.displayValue = submitPrice.value;
    submitPrice.dataset.countrySubmitPrice = country.code;
    submitPrice.setAttribute(
      "aria-label",
      `${country.name}还价目标 ${displayCurrency}`,
    );
    submitField.append(submitLabel, submitPrice);

    price.addEventListener("input", () => {
      const floorRmbCents = rmbCentsFromInputAmount(price.value);
      price.dataset.rmbCents = String(floorRmbCents ?? "");
      price.dataset.displayValue = price.value;
      const submitRmbCents = submitPrice.value.trim()
        ? rmbCentsFromPriceInput(submitPrice)
        : null;
      submitPrice.dataset.rmbCents = String(submitRmbCents ?? "");
      submitPrice.dataset.displayValue = submitPrice.value;
      state.selectedCountries[country.code] = {
        code: country.code,
        name: country.name,
        selected: true,
        floorRmbCents,
        submitRmbCents,
        submissionMode: state.selectedCountries[country.code]?.submissionMode,
      };
      updateActionState();
      persistState();
    });
    submitPrice.addEventListener("input", () => {
      const floorRmbCents = rmbCentsFromPriceInput(price);
      const submitRmbCents = submitPrice.value.trim()
        ? rmbCentsFromInputAmount(submitPrice.value)
        : null;
      price.dataset.rmbCents = String(floorRmbCents ?? "");
      submitPrice.dataset.rmbCents = String(submitRmbCents ?? "");
      submitPrice.dataset.displayValue = submitPrice.value;
      state.selectedCountries[country.code] = {
        code: country.code,
        name: country.name,
        selected: true,
        floorRmbCents,
        submitRmbCents,
        submissionMode: state.selectedCountries[country.code]?.submissionMode,
      };
      updateActionState();
      persistState();
    });
    row.append(label, floorField, submitField);
    elements.priceList.append(row);
  }
}

function showCountryImportNote(message, tone = "success") {
  elements.countryImportNote.textContent = message;
  elements.countryImportNote.hidden = !message;
  elements.countryImportNote.dataset.tone = tone;
}

function applyCountryPriceRows(countryRows) {
  if (!Array.isArray(countryRows) || !countryRows.length) {
    state.selectedCountries = {};
    renderImportedCountries();
    updateActionState();
    persistState();
    showCountryImportNote("Excel 中没有可识别的国家价格参数。", "error");
    return false;
  }

  const enabledRows = countryRows.filter(shouldImportCountryRow);
  if (!enabledRows.length) {
    state.selectedCountries = {};
    renderImportedCountries();
    updateActionState();
    persistState();
    showCountryImportNote(
      "国家价格表没有填写价格，无法启动核价。",
      "error",
    );
    return false;
  }

  const issues = [];
  const selections = {};
  const seen = new Set();
  const modes = new Set();
  for (const row of enabledRows) {
    const code = String(row.国家代码 || "").trim().toUpperCase();
    const country =
      COUNTRIES.find((candidate) => candidate.code === code) ||
      COUNTRIES.find((candidate) => candidate.name === row.国家名称);
    if (!country) {
      issues.push(`${code || row.国家名称 || "未知国家"}：不在支持列表中`);
      continue;
    }
    if (seen.has(country.code)) {
      issues.push(`${country.name}：国家重复`);
      continue;
    }
    seen.add(country.code);

    try {
      const floorRmbCents = toCents(row["最低接受价(RMB)"]);
      if (floorRmbCents <= 0) {
        throw new Error("最低接受价必须大于 0");
      }
      const submitPriceRmbCents = String(row["提交价格(RMB)"] || "").trim()
        ? toCents(row["提交价格(RMB)"])
        : floorRmbCents;
      if (submitPriceRmbCents <= 0) {
        throw new Error("提交价格必须大于 0");
      }
      const submissionMode = String(row.提交方式 || "").includes("直接接受")
        ? "ACCEPT_PLATFORM"
        : "REPRICE";
      modes.add(submissionMode);
      selections[country.code] = {
        code: country.code,
        name: country.name,
        selected: true,
        source: "excel",
        floorRmb: (floorRmbCents / 100).toFixed(2),
        submitRmb: (submitPriceRmbCents / 100).toFixed(2),
        floorRmbCents,
        submitRmbCents: submitPriceRmbCents,
        submissionMode,
      };
    } catch (error) {
      issues.push(`${country.name}：${error.message}`);
    }
  }

  if (modes.size > 1) {
    issues.push("同一次导入只能使用一种提交方式");
  }
  if (issues.length) {
    state.selectedCountries = {};
    renderImportedCountries();
    updateActionState();
    persistState();
    showCountryImportNote(issues.join("；"), "error");
    return false;
  }

  state.selectedCountries = selections;
  for (const checkbox of elements.countryList.querySelectorAll(
    "input[type='checkbox'][data-country-code]",
  )) {
    checkbox.checked = Boolean(selections[checkbox.dataset.countryCode]);
  }
  if (modes.size === 1) {
    elements.lowPricePolicy.value = [...modes][0];
    state.lowPricePolicy = elements.lowPricePolicy.value;
  }
  renderPriceFields();
  renderImportedCountries();
  updateActionState();
  persistState();
  const autoEnabled = enabledRows.filter(
    (row) => countryRowExplicitlyDisabled(row) && countryRowHasRmbPrice(row),
  );
  const includesUs = enabledRows.some(
    (row) => String(row.国家代码 || "").trim().toUpperCase() === "US",
  );
  showCountryImportNote(
    `已导入 ${Object.keys(selections).length} 个国家价格，Excel 源单位为 RMB，当前显示 ${state.inputCurrency}。` +
      (autoEnabled.length
        ? `其中 ${autoEnabled.length} 个填写了价格并自动启用。`
        : "") +
      (includesUs ? " 美国已启用。" : ""),
  );
  return true;
}

function selectedCountrySnapshot() {
  return Object.fromEntries(
    Object.entries(state.selectedCountries)
      .filter(([, country]) => country?.selected)
      .map(([code, country]) => [code, { ...country, selected: true }]),
  );
}

async function renderProfiles() {
  const stored = await chrome.storage.local.get(PROFILES_KEY);
  const profiles = stored[PROFILES_KEY] || {};
  const selected = elements.profileSelect.value;
  elements.profileSelect.replaceChildren(
    new Option("选择已保存方案", ""),
  );
  for (const name of Object.keys(profiles).sort((left, right) =>
    left.localeCompare(right, "zh-CN"),
  )) {
    elements.profileSelect.add(new Option(name, name));
  }
  if (profiles[selected]) {
    elements.profileSelect.value = selected;
  }
}

async function saveProfile() {
  const name = elements.profileName.value.trim();
  if (!name) {
    showStatus("请先填写方案名称", "error");
    elements.profileName.focus();
    return;
  }
  const selected = selectedCountrySnapshot();
  if (!Object.keys(selected).length) {
    showStatus("请先勾选至少一个国家", "error");
    return;
  }
  const stored = await chrome.storage.local.get(PROFILES_KEY);
  const profiles = stored[PROFILES_KEY] || {};
  profiles[name] = {
    name,
    countries: selected,
    inputCurrency: state.inputCurrency,
    fxRateToRmb: state.fxRateToRmb,
    comparisonPolicy: ComparisonPolicy.GREATER_OR_EQUAL,
    lowPricePolicy: elements.lowPricePolicy.value,
    ruleVersion: RULE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  elements.profileSelect.value = name;
  await renderProfiles();
  showStatus(`方案“${name}”已保存`, "success");
}

async function loadSelectedProfile() {
  const name = elements.profileSelect.value;
  if (!name) {
    showStatus("请选择要载入的方案", "error");
    return;
  }
  const stored = await chrome.storage.local.get(PROFILES_KEY);
  const profile = stored[PROFILES_KEY]?.[name];
  if (!profile) {
    showStatus("方案不存在或已被删除", "error");
    return;
  }

  state.selectedCountries = { ...profile.countries };
  state.inputCurrency =
    profile.inputCurrency === PriceCurrency.USD ? PriceCurrency.USD : PriceCurrency.RMB;
  state.fxRateToRmb = String(profile.fxRateToRmb ?? "");
  elements.comparisonPolicy.value =
    profile.ruleVersion === RULE_VERSION
      ? profile.comparisonPolicy || ComparisonPolicy.GREATER_OR_EQUAL
      : ComparisonPolicy.GREATER_OR_EQUAL;
  elements.lowPricePolicy.value = profile.lowPricePolicy || "REPRICE";
  state.comparisonPolicy = elements.comparisonPolicy.value;
  state.lowPricePolicy = elements.lowPricePolicy.value;
  for (const checkbox of elements.countryList.querySelectorAll(
    "input[type='checkbox'][data-country-code]",
  )) {
    checkbox.checked = Boolean(profile.countries[checkbox.dataset.countryCode]);
  }
  updateCurrencyControls();
  renderPriceFields();
  updateActionState();
  persistState();
  showStatus(`已载入方案“${name}”`, "success");
}

async function deleteSelectedProfile() {
  const name = elements.profileSelect.value;
  if (!name) {
    showStatus("请选择要删除的方案", "error");
    return;
  }
  const stored = await chrome.storage.local.get(PROFILES_KEY);
  const profiles = stored[PROFILES_KEY] || {};
  if (!profiles[name]) {
    return;
  }
  delete profiles[name];
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  await renderProfiles();
  showStatus(`方案“${name}”已删除`, "success");
}

function getSelectedCountries({ validate = false } = {}) {
  const countries = [];
  for (const saved of Object.values(state.selectedCountries)) {
    if (!saved?.selected || saved.source !== "excel") {
      continue;
    }
    const country = COUNTRIES.find((item) => item.code === saved.code);
    try {
      if (!country) {
        throw new Error("不在支持的 59 个站点中");
      }
      if (!currencyConfigValid()) {
        throw new Error("美元模式必须先填写大于 0 的汇率");
      }
      const floorRmbCents = Number.isInteger(saved.floorRmbCents)
        ? saved.floorRmbCents
        : toCents(saved.floorRmb);
      if (floorRmbCents <= 0) {
        throw new Error("价格必须大于 0");
      }
      const submitPriceRmbCents = Number.isInteger(saved.submitRmbCents)
        ? saved.submitRmbCents
        : floorRmbCents;
      if (submitPriceRmbCents <= 0) {
        throw new Error("提交价格必须大于 0");
      }
      countries.push({
        siteCode: country.code,
        siteName: country.name,
        floorRmbCents,
        submitPriceRmbCents,
        submissionMode: saved.submissionMode || "REPRICE",
      });
    } catch (error) {
      if (validate) {
        throw new Error(`${saved.name || country?.name || saved.code}：${error.message}`);
      }
      countries.push({
        siteCode: saved.code,
        siteName: saved.name || country?.name || saved.code,
        floorRmbCents: null,
      });
    }
  }
  return countries;
}

function renderIssues(issues) {
  elements.issueList.replaceChildren();
  if (!issues.length) {
    elements.issueList.hidden = true;
    return;
  }
  for (const issue of issues.slice(0, 30)) {
    const item = document.createElement("li");
    const location = issue.rowNumber ? `第 ${issue.rowNumber} 行：` : "";
    item.textContent = `${location}${issue.message}`;
    elements.issueList.append(item);
  }
  if (issues.length > 30) {
    const item = document.createElement("li");
    item.textContent = `另有 ${issues.length - 30} 项问题未展开`;
    elements.issueList.append(item);
  }
  elements.issueList.hidden = false;
}

function isPricingPageTab(tab) {
  try {
    const url = new URL(String(tab?.url || ""));
    return (
      url.origin === "https://agentseller.temu.com" &&
      url.pathname === "/newon/product-select"
    );
  } catch {
    return false;
  }
}

function renderTabLock() {
  if (!state.lockedTab) {
    elements.lockedTabStatus.textContent =
      "尚未锁定核价标签页；开始核价时会自动锁定当前 Temu 页面。";
    elements.lockedTabStatus.dataset.tone = "info";
    elements.lockCurrentTab.textContent = "锁定当前核价标签页";
    elements.unlockTab.hidden = true;
    return;
  }
  elements.lockedTabStatus.textContent =
    `已锁定核价标签页：${state.lockedTab.title || "上新生命周期管理"}。` +
    "切换到其他 Temu 页面不会改变核价目标。";
  elements.lockedTabStatus.dataset.tone = "success";
  elements.lockCurrentTab.textContent = "重新锁定当前标签页";
  elements.unlockTab.hidden = false;
}

async function lockCurrentTemuTab({ announce = true } = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isPricingPageTab(tab)) {
    throw new Error("请先切换到 /newon/product-select 核价页面再锁定");
  }
  state.lockedTab = {
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title || "上新生命周期管理",
  };
  renderTabLock();
  if (announce) {
    showStatus(`已锁定核价标签页：${state.lockedTab.title}`, "success");
  }
  return tab;
}

function unlockTemuTab({ announce = true } = {}) {
  state.lockedTab = null;
  renderTabLock();
  if (announce) {
    showStatus("已解除核价标签页锁定");
  }
}

async function getLockedTemuTab({ autoLock = false } = {}) {
  if (!state.lockedTab) {
    if (!autoLock) {
      throw new Error("请先锁定当前核价标签页");
    }
    return lockCurrentTemuTab({ announce: false });
  }

  let tab;
  try {
    tab = await chrome.tabs.get(state.lockedTab.id);
  } catch {
    unlockTemuTab({ announce: false });
    throw new Error("已锁定的核价标签页已关闭，请重新锁定");
  }
  if (!isPricingPageTab(tab)) {
    unlockTemuTab({ announce: false });
    throw new Error("已锁定的标签页已离开核价页面，请重新锁定");
  }
  state.lockedTab = {
    ...state.lockedTab,
    url: tab.url,
    title: tab.title || state.lockedTab.title,
  };
  renderTabLock();
  return tab;
}

function renderBatches() {
  elements.batchGrid.replaceChildren();
  if (!state.result?.ready || !state.result.batches.length) {
    elements.activeBatchLabel.textContent = "等待导入";
    return;
  }

  state.activeBatch = Math.min(
    Math.max(1, state.activeBatch),
    state.result.batches.length,
  );
  for (const batch of state.result.batches) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "batch-chip";
    button.textContent = String(batch.batchNumber);
    button.title = `第 ${batch.startRow}-${batch.endRow} 条，共 ${batch.skcIds.length} 个 SKC`;
    button.setAttribute(
      "aria-current",
      String(batch.batchNumber === state.activeBatch),
    );
    button.addEventListener("click", () => {
      state.activeBatch = batch.batchNumber;
      renderBatches();
      persistState();
    });
    elements.batchGrid.append(button);
  }
  const active = state.result.batches[state.activeBatch - 1];
  elements.activeBatchLabel.textContent =
    `第 ${active.batchNumber}/${state.result.batches.length} 批 · ` +
    `${active.skcIds.length} 个 SKC`;
}

function validateImport(rows = state.rawRows) {
  state.rawRows = Array.isArray(rows) ? rows : [];
  const overrideCode = elements.productCode.value.trim();
  if (overrideCode) {
    state.rawRows = state.rawRows.map((row) => ({
      ...row,
      货号: overrideCode,
    }));
  }

  try {
    state.result = parseSkcRows(state.rawRows, {
      maxSkc: MAX_SKC,
      batchSize: BATCH_SIZE,
      requireSingleProduct: true,
      requireProductCode: true,
    });
  } catch (error) {
    state.result = {
      ready: false,
      rows: [],
      batches: [],
      stats: { valid: 0, batches: 0, duplicates: 0 },
      issues: [{ rowNumber: null, message: error.message }],
    };
  }

  state.productCode = state.result.productCode || overrideCode;
  if (state.productCode) {
    elements.productCode.value = state.productCode;
  }
  elements.importSummary.hidden = state.rawRows.length === 0;
  elements.validCount.textContent = String(state.result.stats.valid);
  elements.batchCount.textContent = String(state.result.stats.batches);
  elements.duplicateCount.textContent = String(state.result.stats.duplicates);
  renderIssues(state.result.issues);
  renderBatches();
  updateActionState();
  persistState();
}

function updateActionState({ announce = true } = {}) {
  const countries = getSelectedCountries();
  const countriesValid =
    countries.length > 0 && countries.every((country) => country.floorRmbCents > 0);
  const currencyValid = currencyConfigValid();
  const canRun = Boolean(state.result?.ready && countriesValid && currencyValid);
  elements.inspectPage.disabled = !canRun || state.automationRunning;
  elements.startAutomation.disabled = !canRun || state.automationRunning;
  elements.stopAutomation.hidden = !state.automationRunning;
  elements.lockCurrentTab.disabled = state.automationRunning;
  elements.unlockTab.disabled = state.automationRunning;

  if (!announce) {
    return;
  }
  if (state.automationRunning) {
    showStatus(
      `自动核价正在锁定标签页中执行，可切换到其他页面；暂停仍会发送到原核价页`,
      "info",
    );
  } else if (!state.result?.rows.length) {
    showStatus("请先导入同一货号下的 SKC", "info");
  } else if (!state.result.ready) {
    showStatus("导入内容存在问题，请修正后再检查页面", "error");
  } else if (!countries.length) {
    showStatus(
      `已生成 ${state.result.batches.length} 个批次；请导入包含国家价格的 Excel`,
      "error",
    );
  } else if (!currencyValid) {
    showStatus("美元模式请先填写大于 0 的美元汇率", "error");
  } else if (!countriesValid) {
    showStatus(
      `请为每个选中站点填写大于 0 的申报价（${state.inputCurrency}）`,
      "error",
    );
  } else {
    showStatus(
      `已生成 ${state.result.batches.length} 个批次，每批最多 ${BATCH_SIZE} 条`,
      "success",
    );
  }
}

async function handleFile(file) {
  if (!file) {
    return;
  }
  if (!String(file.name || "").toLowerCase().endsWith(".xlsx")) {
    showStatus("请导入包含 SKC 导入和国家价格两个工作表的 .xlsx 文件", "error");
    return;
  }
  elements.fileName.textContent = file.name;
  showStatus("正在读取文件…");
  try {
    const parsed = await parseWorkbookFile(file);
    const firstProductCode = parsed.rows.find((row) => row["货号"])?.["货号"];
    if (firstProductCode) {
      elements.productCode.value = firstProductCode;
    }
    validateImport(parsed.rows);
    applyCountryPriceRows(parsed.countryRows);
  } catch (error) {
    state.rawRows = [];
    state.result = null;
    renderBatches();
    updateActionState();
    showStatus(error.message, "error");
  }
}

function importPastedIds() {
  const ids = splitIdList(elements.pastedSkc.value);
  const productCode = elements.productCode.value.trim();
  if (!productCode) {
    showStatus("粘贴导入前请先填写货号", "error");
    elements.productCode.focus();
    return;
  }
  if (!ids.length) {
    showStatus("没有识别到 SKC ID", "error");
    return;
  }
  validateImport(
    ids.map((skcId) => ({
      货号: productCode,
      "SKC ID": skcId,
      "启用(是/否)": "是",
      备注: "",
    })),
  );
}

async function inspectTemuPage() {
  elements.inspectPage.disabled = true;
  showStatus("正在检查当前 Temu 页面…");
  try {
    const tab = await getLockedTemuTab({ autoLock: true });
    elements.diagnosticUrl.textContent = tab.url || "未知";

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "INSPECT_PAGE",
    });
    renderPageDiagnostics(response);
    if (response.authenticated) {
      showStatus("页面连接成功。当前为只读检查，不会提交价格。", "success");
    } else {
      showStatus("Temu 登录态不可用，请先在当前浏览器完成登录。", "error");
    }
  } catch (error) {
    showStatus(error.message || "页面适配器没有响应，请刷新 Temu 页面", "error");
    elements.diagnosticLogin.textContent = "未连接";
  } finally {
    updateActionState();
  }
}

function renderAutomationResults(rows) {
  elements.reviewTableBody.replaceChildren();
  elements.reviewEmpty.hidden = rows.length > 0;
  elements.reviewTableWrap.hidden = rows.length === 0;
  elements.reviewSummary.hidden = rows.length === 0;

  const approved = rows.filter((row) =>
    ["APPROVED", "ACCEPT_PLATFORM", "REPRICE"].includes(row.decision),
  ).length;
  const submitted = rows.filter(
    (row) =>
      ["APPROVED", "ACCEPT_PLATFORM", "REPRICE"].includes(row.decision) &&
      row.submitted,
  ).length;
  elements.approvedCount.textContent = String(approved);
  elements.excludedCount.textContent = String(rows.length - approved);
  elements.submittedCount.textContent = String(submitted);

  const labels = {
    APPROVED: "可直接提交",
    ACCEPT_PLATFORM: "直接接受平台价",
    REPRICE: "已按目标价还价",
    MANUAL_REVIEW: "人工复核",
    REJECTED: "低于底价",
    BLOCKED: "阻断",
    ALREADY_SUBMITTED: "已提交",
  };
  const displayAmount = (rmbCents) => {
    if (!Number.isInteger(rmbCents)) {
      return "";
    }
    try {
      return (
        convertRmbCentsToCurrencyCents(
          rmbCents,
          state.inputCurrency,
          state.fxRateToRmb,
        ) / 100
      ).toFixed(2);
    } catch {
      return "";
    }
  };
  for (const row of rows.slice(0, 1000)) {
    const tr = document.createElement("tr");
    const values = [
      row.skcId,
      row.siteName,
      row.skuLabel,
      displayAmount(row.platformRmbCents),
      displayAmount(row.floorRmbCents),
      Number.isInteger(row.submitPriceRmbCents)
        ? displayAmount(row.submitPriceRmbCents)
        : "",
      labels[row.decision] || row.decision,
    ];
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = value ?? "";
      tr.append(td);
    }
    elements.reviewTableBody.append(tr);
  }
}

async function executeAutomation(payload, { isRetry = false } = {}) {
  let tab;
  try {
    tab = await getLockedTemuTab({ autoLock: true });
  } catch (error) {
    showStatus(error.message, "error");
    return;
  }

  state.automationRunning = true;
  state.activeBatch = 1;
  renderBatches();
  updateActionState();
  const startedAt = new Date().toISOString();
  showStatus(
    `${isRetry ? "正在重试上次任务" : "正在处理第 1"}：${payload.batches.length} 批…`,
  );
  let response;
  let terminalError = null;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: "START_AUTOMATION",
      payload,
    });
  } catch (error) {
    terminalError = error;
    const connectionFailed =
      /Receiving end does not exist|Could not establish connection/i.test(
        error.message || "",
      );
    response = {
      ok: false,
      code: connectionFailed ? "CONTENT_NOT_READY" : "UNKNOWN_SUBMIT_STATE",
      error: error.message,
      message: `与页面连接中断：${error.message}`,
      rows: [],
      submittedCount: 0,
    };
  }

  const rows = response?.rows || [];
  renderAutomationResults(rows);
  const submittedKeys = rows
    .filter((row) => row.submitted && row.identity)
    .map((row) => row.identity);
  const status = response?.ok
    ? "completed"
    : response?.code === "UNKNOWN_SUBMIT_STATE"
      ? "unknown"
      : response?.code === "CANCELLED"
        ? "cancelled"
        : "failed";
  const record = {
    id: `job-${Date.now()}`,
    createdAt: startedAt,
    finishedAt: new Date().toISOString(),
    status,
    code: response?.code || null,
    productCode: payload.productCode,
    displayCurrency: payload.displayCurrency || PriceCurrency.RMB,
    fxRateToRmb: payload.fxRateToRmb ?? null,
    skcCount: payload.batches.reduce(
      (sum, batch) => sum + batch.skcIds.length,
      0,
    ),
    batchCount: payload.batches.length,
    submittedCount: response?.submittedCount || 0,
    rowCount: rows.length,
    requestedSkcCount: response?.requestedSkcCount ?? recordSkcCount(payload),
    returnedSkcCount: response?.returnedSkcCount ?? 0,
    noPendingSkcCount: response?.noPendingSkcCount ?? 0,
    noPendingSkcIds: response?.noPendingSkcIds || [],
    batchResults: response?.batchResults || [],
    submittedKeys,
    payload: { ...payload, skipKeys: [] },
  };
  state.history = [record, ...state.history].slice(0, 30);
  state.latestJob = record;
  await chrome.storage.local.set({
    [HISTORY_KEY]: state.history,
    temuPricingLastAudit: {
      finishedAt: record.finishedAt,
      productCode: payload.productCode,
      displayCurrency: record.displayCurrency,
      fxRateToRmb: record.fxRateToRmb,
      rows,
    },
  });
  renderJobHistory();
  if (response?.ok) {
    showStatus(
      `自动核价完成：查询 ${record.requestedSkcCount} 个 SKC，返回 ${record.returnedSkcCount} 个，无待确认 ${record.noPendingSkcCount} 个，提交 ${response.submittedCount || 0} 项`,
      "success",
    );
  } else if (status === "unknown") {
    showStatus(
      "提交结果未知，已停止自动重试。请先刷新页面核对平台状态。",
      "error",
    );
  } else if (status === "cancelled") {
    showStatus(response?.message || "任务已暂停", "info");
  } else {
    showStatus(
      response?.message || terminalError?.message || "自动核价执行失败",
      "error",
    );
  }
  state.automationRunning = false;
  updateActionState({ announce: false });
}

function recordSkcCount(payload) {
  return payload.batches.reduce(
    (sum, batch) => sum + batch.skcIds.length,
    0,
  );
}

async function startAutomation() {
  let countries;
  try {
    countries = getSelectedCountries({ validate: true });
  } catch (error) {
    showStatus(error.message, "error");
    return;
  }

  const successfulKeys = elements.forceReprocess.checked
    ? []
    : [
        ...new Set(
          state.history
            .filter(
              (job) =>
                job.productCode === state.result.productCode &&
                Array.isArray(job.submittedKeys) &&
                job.submittedKeys.length > 0,
            )
            .flatMap((job) => job.submittedKeys || []),
        ),
      ];
  const payload = {
    productCode: state.result.productCode,
    displayCurrency: state.inputCurrency,
    fxRateToRmb: currencyConfigValid()
      ? Number(state.fxRateToRmb)
      : null,
    policy: elements.comparisonPolicy.value,
    lowPricePolicy: elements.lowPricePolicy.value,
    submit: !elements.previewOnly.checked,
    skipKeys: elements.previewOnly.checked ? [] : successfulKeys,
    countries,
    batches: state.result.batches.map((batch) => ({
      batchNumber: batch.batchNumber,
      skcIds: batch.skcIds,
    })),
  };
  await executeAutomation(payload);
}

async function stopAutomation() {
  let tab;
  try {
    tab = await getLockedTemuTab();
  } catch (error) {
    showStatus(error.message, "error");
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "STOP_AUTOMATION",
    });
    showStatus(
      response?.message || (response?.ok ? "已请求暂停" : "无法暂停任务"),
      response?.ok ? "info" : "error",
    );
  } catch (error) {
    showStatus(`暂停请求失败：${error.message}`, "error");
  }
}

async function retryLastJob() {
  if (!state.latestJob) {
    showStatus("没有可重试的任务", "error");
    return;
  }
  if (state.latestJob.status === "unknown") {
    showStatus("上次提交结果未知，请先刷新页面核对，不能自动重试", "error");
    return;
  }
  const payload = {
    ...state.latestJob.payload,
    skipKeys: state.latestJob.submittedKeys || [],
  };
  await executeAutomation(payload, { isRetry: true });
}

function renderJobHistory() {
  elements.jobHistory.replaceChildren();
  if (!state.history.length) {
    elements.jobHistory.textContent = "暂无任务记录";
    elements.retryLastJob.disabled = true;
    return;
  }
  const labels = {
    completed: "完成",
    failed: "失败",
    unknown: "结果未知",
    cancelled: "已暂停",
  };
  for (const job of state.history.slice(0, 5)) {
    const item = document.createElement("div");
    item.className = "history-item";
    const summary = document.createElement("span");
    const time = new Date(job.finishedAt).toLocaleString("zh-CN", {
      hour12: false,
    });
    summary.textContent =
      `${time} · ${labels[job.status] || job.status} · ` +
      `${job.displayCurrency || "RMB"}` +
      (job.fxRateToRmb ? ` @ ${job.fxRateToRmb}` : "") +
      ` · ` +
      `${job.skcCount} SKC / 返回 ${job.returnedSkcCount ?? "-"} / ` +
      `无待确认 ${job.noPendingSkcCount ?? "-"} / 提交 ${job.submittedCount} 项`;
    const code = document.createElement("span");
    code.textContent = job.productCode || "";
    item.append(summary, code);
    elements.jobHistory.append(item);
  }
  elements.retryLastJob.disabled =
    !state.latestJob || state.latestJob.status === "unknown";
}

async function restoreJobHistory() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  state.history = Array.isArray(stored[HISTORY_KEY])
    ? stored[HISTORY_KEY]
    : [];
  state.latestJob = state.history[0] || null;
  renderJobHistory();
}

function renderPageDiagnostics(inspection) {
  elements.diagnosticUrl.textContent = inspection.url || "未知";
  elements.diagnosticLogin.textContent = inspection.authenticated ? "已连接" : "需要登录";
  elements.diagnosticFilters.textContent = inspection.filtersDetected
    ? "已发现"
    : "未发现，完成登录后重新检查";
  elements.diagnosticDialog.textContent = inspection.reviewDialogDetected
    ? "已打开"
    : "尚未打开";
}

async function downloadTemplate() {
  try {
    await chrome.downloads.download({
      url: chrome.runtime.getURL("assets/import-template-v2.xlsx"),
      filename: "Temu全球核价助手_导入模板_v2.xlsx",
      saveAs: true,
    });
    showStatus("模板下载已开始", "success");
  } catch (error) {
    showStatus(`模板下载失败：${error.message}`, "error");
  }
}

async function persistState() {
  const snapshot = {
    rawRows: state.rawRows,
    productCode: elements.productCode.value,
    selectedCountries: state.selectedCountries,
    inputCurrency: state.inputCurrency,
    fxRateToRmb: state.fxRateToRmb,
    comparisonPolicy: elements.comparisonPolicy.value,
    lowPricePolicy: elements.lowPricePolicy.value,
    ruleVersion: RULE_VERSION,
    activeBatch: state.activeBatch,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
}

async function restoreState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const snapshot = stored[STORAGE_KEY];
  if (!snapshot) {
    return;
  }

  elements.productCode.value = snapshot.productCode || "";
  elements.comparisonPolicy.value =
    snapshot.ruleVersion === RULE_VERSION
      ? snapshot.comparisonPolicy || ComparisonPolicy.GREATER_OR_EQUAL
      : ComparisonPolicy.GREATER_OR_EQUAL;
  elements.lowPricePolicy.value = snapshot.lowPricePolicy || "REPRICE";
  state.comparisonPolicy = elements.comparisonPolicy.value;
  state.lowPricePolicy = elements.lowPricePolicy.value;
  state.activeBatch = Number(snapshot.activeBatch) || 1;
  state.selectedCountries = snapshot.selectedCountries || {};
  state.inputCurrency =
    snapshot.inputCurrency === PriceCurrency.USD ? PriceCurrency.USD : PriceCurrency.RMB;
  state.fxRateToRmb = String(snapshot.fxRateToRmb ?? "");

  for (const [code, saved] of Object.entries(state.selectedCountries)) {
    const checkbox = elements.countryList.querySelector(
      `[data-country-code="${code}"]`,
    );
    if (checkbox) {
      checkbox.checked = Boolean(saved.selected);
    }
  }
  updateCurrencyControls();
  renderPriceFields();

  if (Array.isArray(snapshot.rawRows) && snapshot.rawRows.length) {
    validateImport(snapshot.rawRows);
  }
}

elements.downloadTemplate.addEventListener("click", downloadTemplate);
elements.fileInput.addEventListener("change", () =>
  handleFile(elements.fileInput.files?.[0]),
);
elements.inputCurrency.addEventListener("change", () => {
  state.inputCurrency = elements.inputCurrency.value;
  updateCurrencyControls();
  renderPriceFields();
  updateActionState();
  persistState();
});
elements.fxRate.addEventListener("input", () => {
  state.fxRateToRmb = elements.fxRate.value.trim();
  updateActionState();
  persistState();
});
elements.fxRate.addEventListener("change", () => {
  state.fxRateToRmb = elements.fxRate.value.trim();
  renderPriceFields();
  updateActionState();
  persistState();
});
elements.importPasted.addEventListener("click", importPastedIds);
elements.productCode.addEventListener("change", () => {
  if (state.rawRows.length) {
    validateImport(state.rawRows);
  }
});
elements.comparisonPolicy.addEventListener("change", () => {
  state.comparisonPolicy = elements.comparisonPolicy.value;
  persistState();
});
elements.lowPricePolicy.addEventListener("change", () => {
  state.lowPricePolicy = elements.lowPricePolicy.value;
  persistState();
});
elements.toPrice.addEventListener("click", () => {
  if (!getSelectedCheckboxCountries().length) {
    showStatus("请至少勾选一个核价国家", "error");
    return;
  }
  renderPriceFields();
  elements.countrySection.hidden = true;
  elements.priceSection.hidden = false;
  elements.priceSection.scrollIntoView({ block: "start" });
  updateActionState();
});
elements.backToCountries.addEventListener("click", () => {
  elements.priceSection.hidden = true;
  elements.countrySection.hidden = false;
  elements.countrySection.scrollIntoView({ block: "start" });
  updateActionState();
});
elements.saveProfile.addEventListener("click", saveProfile);
elements.loadProfile.addEventListener("click", loadSelectedProfile);
elements.deleteProfile.addEventListener("click", deleteSelectedProfile);
elements.lockCurrentTab.addEventListener("click", async () => {
  try {
    await lockCurrentTemuTab();
  } catch (error) {
    showStatus(error.message, "error");
  }
});
elements.unlockTab.addEventListener("click", () => unlockTemuTab());
elements.inspectPage.addEventListener("click", inspectTemuPage);
elements.startAutomation.addEventListener("click", startAutomation);
elements.stopAutomation.addEventListener("click", stopAutomation);
elements.retryLastJob.addEventListener("click", retryLastJob);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.lockedTab?.id === tabId) {
    unlockTemuTab({ announce: false });
    showStatus("已锁定的核价标签页已关闭，请重新锁定", "error");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (state.lockedTab?.id !== tabId || !changeInfo.url) {
    return;
  }
  if (!isPricingPageTab(tab)) {
    unlockTemuTab({ announce: false });
    showStatus("已锁定的标签页已离开核价页面，请重新锁定", "error");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "TEMU_AUTOMATION_PROGRESS") {
    return;
  }
  if (!state.automationRunning) {
    return;
  }
  const batchMatch = String(message.message || "").match(/第\s*(\d+)\s*批/);
  if (batchMatch) {
    state.activeBatch = Number(batchMatch[1]);
    renderBatches();
  }
  showStatus(message.message || "自动核价执行中…");
});

updateCurrencyControls();
renderTabLock();
renderCountries();
renderProfiles().catch((error) =>
  showStatus(`读取核价方案失败：${error.message}`, "error"),
);
restoreJobHistory().catch((error) =>
  showStatus(`读取任务历史失败：${error.message}`, "error"),
);
restoreState()
  .catch((error) => showStatus(`恢复上次状态失败：${error.message}`, "error"))
  .finally(() => updateActionState());
