const REQUEST_TIMEOUT_MS = 8000;

async function proxyRobloxRequest(req, res, targetUrl, method, body) {
  if (req.method !== method) {
    res.setHeader("Allow", method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      method,
      headers: body === undefined
        ? { "Accept": "application/json" }
        : { "Content-Type": "application/json", "Accept": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    return res.status(response.ok ? 200 : response.status).json(payload);
  } catch (error) {
    const timedOut = error.name === "AbortError";
    console.error("[Roblox API proxy]", timedOut ? "Request timed out" : error.name);
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "Roblox API request timed out" : "Roblox API request failed"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseRequestBody(body) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

module.exports = { proxyRobloxRequest, parseRequestBody };
