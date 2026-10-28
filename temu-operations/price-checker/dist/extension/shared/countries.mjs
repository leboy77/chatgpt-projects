export const COUNTRIES = [
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

const DISABLED_VALUES = new Set(["否", "n", "no", "false", "0", "禁用"]);

export function countryRowHasRmbPrice(row) {
  return (
    String(row?.["最低接受价(RMB)"] ?? "").trim() !== "" ||
    String(row?.["提交价格(RMB)"] ?? "").trim() !== ""
  );
}

export function countryRowExplicitlyDisabled(row) {
  const value = String(row?.["启用(是/否)"] ?? "").trim().toLowerCase();
  return value !== "" && DISABLED_VALUES.has(value);
}

export function shouldImportCountryRow(row) {
  return !countryRowExplicitlyDisabled(row) || countryRowHasRmbPrice(row);
}
