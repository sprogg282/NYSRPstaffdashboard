const ROBLOX_USERNAME_LOOKUP_URL = "https://users.roblox.com/v1/usernames/users";
const REQUEST_TIMEOUT_MS = 8000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  if (!body || !Array.isArray(body.usernames) || !body.usernames[0]) {
    return res.status(400).json({ error: "usernames array required" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ROBLOX_USERNAME_LOOKUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    return res.status(response.ok ? 200 : response.status).json(payload);
  } catch (error) {
    const timedOut = error.name === "AbortError";
    console.error("[Roblox username lookup]", timedOut ? "Request timed out" : error);
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "Roblox API request timed out" : "Roblox API request failed"
    });
  } finally {
    clearTimeout(timeout);
  }
};
