const { proxyRobloxRequest, parseRequestBody } = require("../../roblox-proxy");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseRequestBody(req.body);
  if (!body) return res.status(400).json({ error: "Invalid JSON body" });

  return proxyRobloxRequest(
    req,
    res,
    "https://presence.roblox.com/v1/presence/users",
    "POST",
    body
  );
};
