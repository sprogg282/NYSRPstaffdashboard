const { proxyRobloxRequest, parseRequestBody } = require("../../roblox-proxy");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseRequestBody(req.body);
  if (!body) return res.status(400).json({ error: "Invalid JSON body" });
  if (!Array.isArray(body.usernames) || !body.usernames[0]) {
    return res.status(400).json({ error: "usernames array required" });
  }

  return proxyRobloxRequest(
    req,
    res,
    "https://users.roblox.com/v1/usernames/users",
    "POST",
    body
  );
};
