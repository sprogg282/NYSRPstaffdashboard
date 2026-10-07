import { defineConfig, loadEnv } from 'vite';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      proxy: {
        '/api/roblox/lookup': {
          target: 'https://users.roblox.com',
          changeOrigin: true,
          rewrite: () => '/v1/usernames/users'
        },
        '/api/roblox/user': {
          target: 'https://users.roblox.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/roblox\/user/, '/v1/users')
        },
        '/api/roblox/headshot': {
          target: 'https://thumbnails.roblox.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/roblox\/headshot/, '/v1/users/avatar-headshot')
        },
        '/api/roblox/avatar': {
          target: 'https://thumbnails.roblox.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/roblox\/avatar/, '/v1/users/avatar')
        },
        '/api/roblox/presence': {
          target: 'https://presence.roblox.com',
          changeOrigin: true,
          rewrite: () => '/v1/presence/users'
        }
      }
    },
    plugins: [
      {
        name: 'discord-moderation-audit-handler',
        configureServer(server) {
          server.middlewares.use('/api/discord/audit', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Method not allowed' }));
            }

            let body = '';
            req.on('data', chunk => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy(new Error('Request body too large'));
            });
            req.on('end', async () => {
              try {
                req.body = body || '{}';
                req.nysrpAuditWebhookUrl = process.env.NYSRP_AUDIT_WEBHOOK_URL || env.NYSRP_AUDIT_WEBHOOK_URL;
                if (!process.env.NYSRP_AUDIT_WEBHOOK_URL && req.nysrpAuditWebhookUrl) {
                  process.env.NYSRP_AUDIT_WEBHOOK_URL = req.nysrpAuditWebhookUrl;
                }

                const { createRequire } = await import('module');
                const nodeRequire = createRequire(import.meta.url);
                const auditHandler = nodeRequire('./api/discord/audit.js');
                const apiResponse = {
                  setHeader: res.setHeader.bind(res),
                  status(statusCode) {
                    res.statusCode = statusCode;
                    return this;
                  },
                  json(payload) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(payload));
                    return this;
                  }
                };

                await auditHandler(req, apiResponse);
              } catch (err) {
                console.error('[Discord Audit Middleware Error]', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Internal server error processing audit log' }));
              }
            });
          });
        }
      },
      {
        name: 'discord-shift-webhook-handler',
        configureServer(server) {
          server.middlewares.use('/api/discord/shift-webhook', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Method not allowed' }));
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body || '{}');
                if (!payload.action || !SUPPORTED_ACTIONS.includes(payload.action)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'Unsupported action' }));
                }

                const embed = buildDiscordShiftEmbed(payload);
                if (!embed) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'Invalid shift payload' }));
                }

                const webhookUrl = process.env.DISCORD_SHIFT_WEBHOOK_URL || env.DISCORD_SHIFT_WEBHOOK_URL;
                if (!webhookUrl) {
                  console.warn('[Discord Webhook] DISCORD_SHIFT_WEBHOOK_URL not configured on server.');
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, warning: 'Webhook not configured on server' }));
                }

                const discordRes = await fetch(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ embeds: [embed] })
                });

                res.statusCode = discordRes.ok ? 200 : discordRes.status;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: discordRes.ok }));
              } catch (err) {
                console.error('[Discord Webhook Server Error]', err?.name || 'Error');
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Internal server error processing webhook' }));
              }
            });
          });
        }
      },
      {
        name: 'erlc-api-handler',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url || (!req.url.startsWith('/api/erlc') && !req.url.startsWith('/api/report-error'))) {
              return next();
            }

            try {
              const { createRequire } = await import('module');
              const nodeRequire = createRequire(import.meta.url);
              const { handleErlcApiRequest, erlcInstance } = nodeRequire('./server-erlc.js');

              for (const name of ['WEBSITE_SYSTEM_LOG', 'NYSRP_ERROR_WEBHOOK_URL']) {
                if (!process.env[name] && env[name]) {
                  process.env[name] = env[name];
                }
              }

              if (env.ERLC_SERVER_KEY || process.env.ERLC_SERVER_KEY) {
                erlcInstance.updateConfig(
                  env.ERLC_SERVER_KEY || process.env.ERLC_SERVER_KEY,
                  env.ERLC_API_BASE_URL || process.env.ERLC_API_BASE_URL
                );
              }

              const handled = await handleErlcApiRequest(req, res);
              if (handled === null) {
                next();
              }
            } catch (err) {
              console.error('[Vite ER:LC Middleware Error]', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Internal server error in ER:LC proxy' }));
            }
          });
        }
      }
    ]
  };
});
