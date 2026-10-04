const ACTION_LABELS = {
  warn: "WARN",
  ban: "BAN",
  kick: "KICK",
  note: "NOTE",
  bolo: "BAN BOLO"
};

function fieldValue(value, fallback, maxLength = 1024) {
  const text = String(value || fallback);
  return text.slice(0, maxLength) || fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const action = ACTION_LABELS[String(payload?.type || "").toLowerCase()];
  if (!action || !payload.username || !payload.robloxId) {
    return res.status(400).json({ error: "Invalid moderation audit payload" });
  }

  const webhookUrl = req.nysrpAuditWebhookUrl || process.env.NYSRP_AUDIT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[Discord moderation audit] NYSRP_AUDIT_WEBHOOK_URL is not configured");
    return res.status(503).json({ error: "Moderation audit webhook is not configured on the server" });
  }

  const fields = [
    { name: "Target", value: fieldValue(payload.username, "Unknown"), inline: true },
    { name: "Roblox ID", value: fieldValue(payload.robloxId, "Unknown", 64), inline: true },
    { name: "Staff", value: fieldValue(payload.staff, "Staff"), inline: true },
    { name: "Reason", value: fieldValue(payload.reason, "No reason provided"), inline: false }
  ];
  if (payload.duration) {
    fields.push({ name: "Duration", value: fieldValue(payload.duration, "N/A", 256), inline: true });
  }
  if (payload.evidence) {
    fields.push({ name: "Evidence", value: fieldValue(payload.evidence, "N/A"), inline: false });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `${action} Logged`,
          color: 0x3498DB,
          fields,
          footer: { text: "NYSRP Staff Dashboard" },
          timestamp: payload.date || new Date().toISOString()
        }]
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error("[Discord moderation audit] Delivery failed with HTTP", response.status);
      return res.status(502).json({ error: "Discord moderation audit delivery failed" });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Discord moderation audit] Delivery failed", error.name);
    return res.status(502).json({ error: "Discord moderation audit delivery failed" });
  }
};
