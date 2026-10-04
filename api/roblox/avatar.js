const { proxyRobloxRequest } = require("../../roblox-proxy");

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, "https://nysrp.invalid");
  const targetUrl = new URL("/v1/users/avatar", "https://thumbnails.roblox.com");
  targetUrl.search = requestUrl.search;

  return proxyRobloxRequest(req, res, targetUrl.toString(), "GET");
};
