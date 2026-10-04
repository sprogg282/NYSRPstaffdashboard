const { proxyRobloxRequest } = require("../../../roblox-proxy");

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, "https://nysrp.invalid");
  const userId = requestUrl.pathname.split("/").pop();
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({ error: "Invalid Roblox User ID" });
  }

  return proxyRobloxRequest(
    req,
    res,
    `https://users.roblox.com/v1/users/${userId}`,
    "GET"
  );
};
