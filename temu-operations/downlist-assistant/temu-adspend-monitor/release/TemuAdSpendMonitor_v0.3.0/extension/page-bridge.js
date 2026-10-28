(function initTemuAdSpendPageBridge() {
  if (window.__temuAdSpendPageBridgeLoaded) return;
  window.__temuAdSpendPageBridgeLoaded = true;

  const REQUEST_SOURCE = "temu-adspend-content";
  const RESPONSE_SOURCE = "temu-adspend-page-bridge";
  const API_BASE = "/api/v1/coconut";

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.source !== REQUEST_SOURCE ||
      !["fetchAdsDetail", "modifyAds"].includes(message.type)
    ) {
      return;
    }

    try {
      const result = await handleRequest(message);
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "result",
          requestId: message.requestId,
          ok: true,
          data: result
        },
        location.origin
      );
    } catch (error) {
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "result",
          requestId: message.requestId,
          ok: false,
          error: String(error?.message || error),
          code: error?.code || "PAGE_FETCH_FAILED"
        },
        location.origin
      );
    }
  });

  async function handleRequest(message) {
    const url =
      message.type === "fetchAdsDetail"
        ? `${API_BASE}/ad/ads_detail`
        : `${API_BASE}/ad/modify_ads`;
    const body =
      message.type === "fetchAdsDetail"
        ? message.payload
        : { modifyAdDtos: message.payload?.modifyAdDtos || [] };
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(5000, Number(message.timeoutMs || 20000))
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json;charset=UTF-8"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        const error = new Error("接口返回的不是 JSON");
        error.code = "API_NON_JSON";
        throw error;
      }
      if (!response.ok) {
        const error = new Error(
          `接口 HTTP ${response.status}: ${String(
            json?.error_msg || json?.message || ""
          ).slice(0, 300)}`
        );
        error.code =
          response.status === 429 ? "API_RATE_LIMITED" : "API_HTTP_ERROR";
        throw error;
      }
      return {
        status: response.status,
        body: json
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("页面数据请求超时");
        timeoutError.code = "FETCH_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
})();
