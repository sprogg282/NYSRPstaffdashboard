const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleErlcApiRequest } = require("./server-erlc");
const discordAuditHandler = require("./api/discord/audit");

const PORT = process.env.PORT || 3001;

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;

    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept"
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createNodeApiResponse(res) {
  return {
    setHeader: res.setHeader.bind(res),
    status(statusCode) {
      res.statusCode = statusCode;
      return this;
    },
    json(payload) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
      res.end(JSON.stringify(payload));
      return this;
    }
  };
}

async function proxyJson(res, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    sendJson(res, error.name === "AbortError" ? 504 : 502, {
      error: error.name === "AbortError" ? "Roblox API request timed out" : "Roblox API request failed"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildDiscordShiftEmbed(payload) {
  const { action, staffName, staffRank, shiftId, startTime, endTime, timeFormatted, durationFormatted, breakFormatted } = payload;
  const staff = String(staffName || "Staff");
  const rank = String(staffRank || "Staff");
  const id = String(shiftId || "N/A");
  const time = String(timeFormatted || new Date().toLocaleTimeString());

  if (action === "shift_started") {
    return {
      title: "🟢 SHIFT STARTED",
      color: 0x2ECC71, // Green
      fields: [
        { name: "Staff", value: staff, inline: true },
        { name: "Rank", value: rank, inline: true },
        { name: "Time", value: time, inline: false },
        { name: "Shift ID", value: id, inline: false }
      ],
      footer: { text: "NYSRP ER:LC Shift Tracker" },
      timestamp: new Date().toISOString()
    };
  }

  if (action === "break_started") {
    return {
      title: "🟡 BREAK STARTED",
      color: 0xF1C40F, // Gold
      fields: [
        { name: "Staff", value: staff, inline: true },
        { name: "Rank", value: rank, inline: true },
        { name: "Time", value: time, inline: false },
        { name: "Shift ID", value: id, inline: false }
      ],
      footer: { text: "NYSRP ER:LC Shift Tracker" },
      timestamp: new Date().toISOString()
    };
  }

  if (action === "break_ended") {
    const fields = [
      { name: "Staff", value: staff, inline: true },
      { name: "Rank", value: rank, inline: true },
      { name: "Time", value: time, inline: false }
    ];
    if (breakFormatted) {
      fields.push({ name: "Break Duration", value: String(breakFormatted), inline: true });
    }
    fields.push({ name: "Shift ID", value: id, inline: false });
    return {
      title: "🔵 RETURNED FROM BREAK",
      color: 0x3498DB, // Blue
      fields,
      footer: { text: "NYSRP ER:LC Shift Tracker" },
      timestamp: new Date().toISOString()
    };
  }

  if (action === "shift_ended") {
    const fields = [
      { name: "Staff", value: staff, inline: true },
      { name: "Rank", value: rank, inline: true },
      { name: "Start", value: String(startTime || time), inline: true },
      { name: "End", value: String(endTime || time), inline: true },
      { name: "Duration", value: String(durationFormatted || "0s"), inline: false }
    ];
    if (breakFormatted) {
      fields.push({ name: "Break Time", value: String(breakFormatted), inline: true });
    }
    fields.push({ name: "Shift ID", value: id, inline: false });
    return {
      title: "🔴 SHIFT ENDED",
      color: 0xE74C3C, // Red
      fields,
      footer: { text: "NYSRP ER:LC Shift Tracker" },
      timestamp: new Date().toISOString()
    };
  }

  return null;
}

const SUPPORTED_ACTIONS = ["shift_started", "break_started", "break_ended", "shift_ended"];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  // Lookup username -> ID
  if (req.method === "POST" && (url.pathname === "/api/roblox" || url.pathname === "/api/roblox/lookup")) {
    try {
      const body = await readJson(req);
      if (!Array.isArray(body.usernames) || !body.usernames[0]) {
        return sendJson(res, 400, { error: "usernames array required" });
      }

      return proxyJson(res, "https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
  }

  // User details
  if (req.method === "GET" && url.pathname.startsWith("/api/roblox/user/")) {
    const userId = url.pathname.split("/").pop();
    if (!/^\d+$/.test(userId)) return sendJson(res, 400, { error: "Invalid Roblox User ID" });
    return proxyJson(res, `https://users.roblox.com/v1/users/${userId}`);
  }

  // Avatar Headshot
  if (req.method === "GET" && url.pathname === "/api/roblox/headshot") {
    return proxyJson(res, `https://thumbnails.roblox.com/v1/users/avatar-headshot${url.search}`);
  }

  // Full Avatar
  if (req.method === "GET" && url.pathname === "/api/roblox/avatar") {
    return proxyJson(res, `https://thumbnails.roblox.com/v1/users/avatar${url.search}`);
  }

  // Presence
  if (req.method === "POST" && url.pathname === "/api/roblox/presence") {
    try {
      const body = await readJson(req);
      return proxyJson(res, "https://presence.roblox.com/v1/presence/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
  }

  // Discord Shift Webhook Dispatcher
  if (req.method === "POST" && url.pathname === "/api/discord/shift-webhook") {
    try {
      const body = await readJson(req);
      if (!body.action || !SUPPORTED_ACTIONS.includes(body.action)) {
        return sendJson(res, 400, { error: "Unsupported action" });
      }

      const embed = buildDiscordShiftEmbed(body);
      if (!embed) {
        return sendJson(res, 400, { error: "Invalid shift payload" });
      }

      const webhookUrl = process.env.DISCORD_SHIFT_WEBHOOK_URL;
      if (!webhookUrl) {
        console.warn("[Discord Webhook] DISCORD_SHIFT_WEBHOOK_URL not configured on server.");
        return sendJson(res, 200, { success: false, warning: "Webhook URL not configured on server" });
      }

      const discordRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] })
      });

      return sendJson(res, discordRes.ok ? 200 : discordRes.status, { success: discordRes.ok });
    } catch (error) {
      console.error("[Discord Webhook Server Error]", error?.name || "Error");
      return sendJson(res, 500, { error: "Internal server error processing webhook" });
    }
  }

  // Discord Moderation Audit Webhook Dispatcher
  if (url.pathname === "/api/discord/audit") {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    try {
      req.body = await readJson(req);
      req.nysrpAuditWebhookUrl = process.env.NYSRP_AUDIT_WEBHOOK_URL;
      return await discordAuditHandler(req, createNodeApiResponse(res));
    } catch (error) {
      console.error("[Discord Audit Server Error]", error?.name || "Error");
      return sendJson(res, 500, { error: "Internal server error processing audit log" });
    }
  }

  // ER:LC & Error Reporting Endpoints
  if (url.pathname === "/api/report-error" || url.pathname.startsWith("/api/erlc")) {
    const handled = await handleErlcApiRequest(req, res, sendJson);
    if (handled !== null) return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
