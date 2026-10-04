const ROBLOX_HEADSHOT_URL = "https://thumbnails.roblox.com/v1/users/avatar-headshot";
const REQUEST_TIMEOUT_MS = 8000;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const queryIndex = req.url.indexOf("?");
  const query = queryIndex === -1 ? "" : req.url.slice(queryIndex);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ROBLOX_HEADSHOT_URL}${query}`, {
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    return res.status(response.ok ? 200 : response.status).json(payload);
  } catch (error) {
    const timedOut = error.name === "AbortError";
    console.error("[Roblox headshot lookup]", timedOut ? "Request timed out" : error);
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "Roblox API request timed out" : "Roblox API request failed"
    });
  } finally {
    clearTimeout(timeout);
  }
};
