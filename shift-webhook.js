const SUPPORTED_ACTIONS = ["shift_started", "break_started", "break_ended", "shift_ended"];

function buildDiscordShiftEmbed(payload) {
  const { action, staffName, staffRank, shiftId, startTime, endTime, timeFormatted, durationFormatted, breakFormatted } = payload;
  const staff = String(staffName || "Staff");
  const rank = String(staffRank || "Staff");
  const id = String(shiftId || "N/A");
  const time = String(timeFormatted || new Date().toLocaleTimeString());

  if (action === "shift_started" || action === "break_started") {
    const isShiftStart = action === "shift_started";
    return {
      title: isShiftStart ? "🟢 SHIFT STARTED" : "🟡 BREAK STARTED",
      color: isShiftStart ? 0x2ECC71 : 0xF1C40F,
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
      color: 0x3498DB,
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
      color: 0xE74C3C,
      fields,
      footer: { text: "NYSRP ER:LC Shift Tracker" },
      timestamp: new Date().toISOString()
    };
  }

  return null;
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
  payload = payload || {};
  if (!SUPPORTED_ACTIONS.includes(payload.action)) {
    return res.status(400).json({ error: "Unsupported action" });
  }

  const embed = buildDiscordShiftEmbed(payload);
  const webhookUrl = process.env.DISCORD_SHIFT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[Discord shift webhook] DISCORD_SHIFT_WEBHOOK_URL is not configured");
    return res.status(503).json({ error: "Shift webhook is not configured on the server" });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      console.error("[Discord shift webhook] Delivery failed with HTTP", response.status);
      return res.status(502).json({ error: "Discord shift webhook delivery failed" });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Discord shift webhook] Delivery failed", error.name);
    return res.status(502).json({ error: "Discord shift webhook delivery failed" });
  }
};
