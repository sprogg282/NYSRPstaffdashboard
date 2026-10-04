// ==========================================
// NYSRP Website - Server-Side ER:LC API Service
// ==========================================

class ErlcApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ErlcApiError';
    this.details = details;
    this.isOffline = Boolean(
      (details.status === 422 && String(message).toLowerCase().includes('offline')) ||
      String(message).toLowerCase().includes('private server is currently offline')
    );
    this.isRateLimited = details.status === 429;
    this.isUnauthorized = details.status === 401 || details.status === 403;
  }
}

function parseRobloxPlayer(value) {
  if (!value || value === 'Remote Server') {
    return { name: value || 'Unknown', id: null, raw: value || 'Unknown' };
  }

  const separator = value.indexOf(':');
  if (separator === -1) return { name: value, id: null, raw: value };

  const name = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return { name, id, raw: value };
}

// Sanitization function: NEVER send secrets, keys, webhook URLs, tokens, or passwords to Discord
function sanitizeSecrets(value) {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'object' ? JSON.stringify(value) : String(value);

  // Mask ERLC Server Key
  const serverKey = (typeof erlcInstance !== 'undefined' && erlcInstance?.serverKey) || process.env.ERLC_SERVER_KEY;
  if (serverKey && serverKey.length > 5) {
    str = str.split(serverKey).join('[REDACTED_SERVER_KEY]');
  }

  // Mask Webhook URLs
  const webhookUrls = [
    process.env.NYSRP_ERROR_WEBHOOK_URL,
    process.env.ERROR_WEBHOOK_URL,
    process.env.DISCORD_SHIFT_WEBHOOK_URL
  ].filter(Boolean);

  for (const url of webhookUrls) {
    if (url.length > 10) {
      str = str.split(url).join('[REDACTED_WEBHOOK_URL]');
    }
  }

  // Mask Discord Webhook URL tokens
  str = str.replace(/(https?:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/)[^\s"']+/gi, '$1[REDACTED_TOKEN]');

  // Mask Authorization headers, bearer tokens, api keys, passwords
  str = str.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
  str = str.replace(/Server-Key:\s*[^\s,]+/gi, 'Server-Key: [REDACTED_KEY]');
  str = str.replace(/(?:password|apiKey|token|secret|auth)\s*[:=]\s*['"]?[a-zA-Z0-9_\-\.]{8,}['"]?/gi, '[REDACTED_SECRET]');

  return str;
}

function escapeDiscordMentions(text) {
  if (!text) return '';
  return String(text)
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&?(\d+)>/gi, '<@\u200b$1>');
}

// In-Memory Deduplication Cache (Prevents duplicate alerts within 15-second window)
const recentAlerts = new Map();
const DEDUPE_WINDOW_MS = 15000;

function isDuplicateAlert(fingerprint) {
  const now = Date.now();
  const lastTime = recentAlerts.get(fingerprint);
  if (lastTime && (now - lastTime) < DEDUPE_WINDOW_MS) {
    return true;
  }
  recentAlerts.set(fingerprint, now);

  // Periodic cleanup
  if (recentAlerts.size > 200) {
    for (const [k, v] of recentAlerts.entries()) {
      if (now - v > DEDUPE_WINDOW_MS) recentAlerts.delete(k);
    }
  }
  return false;
}

// Server-side Discord Off-Duty Command Alert Webhook Dispatcher
async function sendOffDutyCommandAlert(data) {
  const webhookUrl = process.env.NYSRP_OFF_DUTY_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Off-Duty Alert] NYSRP_OFF_DUTY_WEBHOOK_URL not configured on server.');
    return;
  }

  const {
    staffName,
    staffRank,
    robloxUsername,
    robloxId,
    command,
    source,
    timestamp,
    eventId
  } = data;

  const staff = sanitizeSecrets(String(staffName || robloxUsername || 'Staff'));
  const rank = sanitizeSecrets(String(staffRank || 'Staff'));
  const cmd = sanitizeSecrets(String(command || 'Unknown'));
  const src = sanitizeSecrets(String(source || 'ER:LC In-Game'));

  const fingerprint = eventId || `offduty|${staff}|${cmd}|${src}|${Math.floor((timestamp ? new Date(timestamp).getTime() : Date.now()) / 30000)}`;
  if (isDuplicateAlert(fingerprint)) {
    return;
  }

  const cleanStaff = escapeDiscordMentions(`${staff}${rank ? ` (${rank})` : ''}`);
  const cleanCommand = escapeDiscordMentions(cmd).slice(0, 500);
  const cleanSource = escapeDiscordMentions(src);

  const embed = {
    title: '⚠️ OFF-DUTY ER:LC Command Detected',
    color: 0xF59E0B, // Amber
    description: 'A staff member executed an administrative / server command while **OFF DUTY**.',
    fields: [
      { name: 'Staff Member', value: cleanStaff, inline: true },
      { name: 'Duty Status', value: '🔴 **OFF DUTY**', inline: true },
      { name: 'Source', value: cleanSource, inline: true },
      { name: 'Command Executed', value: `\`${cleanCommand}\``, inline: false }
    ],
    footer: { text: 'NYSRP Off-Duty Command Monitor' },
    timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
  };

  if (robloxUsername || robloxId) {
    embed.fields.push({
      name: 'Roblox Account',
      value: `${escapeDiscordMentions(sanitizeSecrets(String(robloxUsername || 'Unknown')))} (ID: \`${escapeDiscordMentions(sanitizeSecrets(String(robloxId || 'N/A')))}\`)`,
      inline: true
    });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    // Silently suppress webhook delivery failures
  }
}

// Server-side Discord Error Reporting Webhook Dispatcher
async function sendDiscordErrorReport(data) {
  const webhookUrl = process.env.NYSRP_ERROR_WEBHOOK_URL || process.env.ERROR_WEBHOOK_URL || process.env.DISCORD_SHIFT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const { title, staffUsername, detail, system, endpoint, status, command, extra } = data;
  const staff = sanitizeSecrets(String(staffUsername || 'Staff'));
  const titleStr = sanitizeSecrets(String(title || 'ER:LC System Error'));
  const endpointStr = sanitizeSecrets(String(endpoint || '/server/command'));
  const statusStr = sanitizeSecrets(String(status || '500'));
  const systemStr = sanitizeSecrets(String(system || 'NYSRP ER:LC Management System'));
  const detailRaw = detail || `${staff}: An error occurred.`;
  const detailStr = sanitizeSecrets(String(detailRaw)).slice(0, 1000);

  // Duplicate Check
  const fingerprint = `${systemStr}|${titleStr}|${endpointStr}|${statusStr}|${detailStr.slice(0, 80)}`;
  if (isDuplicateAlert(fingerprint)) {
    return;
  }

  // Determine Embed Color
  let color = 0xEF4444; // Default Red
  const statusNum = Number(statusStr);
  if (statusNum === 422 || titleStr.toLowerCase().includes('offline')) {
    color = 0xF59E0B; // Amber for Offline
  } else if (statusNum === 429) {
    color = 0xF59E0B; // Amber for Rate Limit
  } else if (statusNum === 401 || statusNum === 403) {
    color = 0xEF4444; // Red for Unauthorized
  }

  const embed = {
    title: titleStr,
    color,
    fields: [
      { name: 'Detail', value: detailStr || 'No details provided', inline: false },
      { name: 'System', value: systemStr, inline: true },
      { name: 'Endpoint', value: endpointStr, inline: true },
      { name: 'HTTP Status', value: statusStr, inline: true }
    ],
    footer: { text: 'NYSRP Error Reporting System' },
    timestamp: new Date().toISOString()
  };

  if (command) {
    embed.fields.push({
      name: 'Command Attempted',
      value: `\`${sanitizeSecrets(String(command)).slice(0, 200)}\``,
      inline: false
    });
  }

  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (embed.fields.length < 10) {
        embed.fields.push({
          name: sanitizeSecrets(String(k)),
          value: sanitizeSecrets(String(v)).slice(0, 500),
          inline: true
        });
      }
    }
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    // Silently suppress webhook delivery failures
  }
}

class ErlcService {
  constructor(options = {}) {
    this.serverKey = options.serverKey || process.env.ERLC_SERVER_KEY || '';
    this.baseUrl = (options.baseUrl || process.env.ERLC_API_BASE_URL || 'https://api.erlc.gg/v1').replace(/\/$/, '');
    this.minRequestIntervalMs = Number(process.env.ERLC_MIN_REQUEST_INTERVAL_MS) || 850;
    this.timeoutMs = Number(process.env.ERLC_TIMEOUT_MS) || 10000;
    this.cache = new Map();
    this.lastRequestAt = 0;
    this.queue = Promise.resolve();
  }

  updateConfig(key, url) {
    if (key) this.serverKey = key;
    if (url) this.baseUrl = url.replace(/\/$/, '');
  }

  async request(endpoint, options = {}) {
    const method = options.method || 'GET';
    const cacheKey = `${method}:${endpoint}:${JSON.stringify(options.body || {})}`;
    const cached = this.cache.get(cacheKey);

    if (options.cacheTtlMs > 0 && cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const queuedAt = Date.now();
    const run = this.queue.catch(() => {}).then(() => this.execute(endpoint, options, 1, queuedAt));
    this.queue = run.catch(() => {});
    const value = await run;

    if (options.cacheTtlMs > 0) {
      this.cache.set(cacheKey, { value, expiresAt: Date.now() + options.cacheTtlMs });
    }

    return value;
  }

  async execute(endpoint, options, attempt = 1, queuedAt = Date.now()) {
    const waitMs = Math.max(0, this.minRequestIntervalMs - (Date.now() - this.lastRequestAt));
    if (waitMs) await new Promise(r => setTimeout(r, waitMs));

    const serverKey = this.serverKey || process.env.ERLC_SERVER_KEY;
    if (!serverKey) {
      throw new ErlcApiError('ERLC_SERVER_KEY is not configured on server.', { endpoint, status: 500 });
    }

    const url = `${this.baseUrl}${endpoint}`;
    const startedAt = Date.now();
    this.lastRequestAt = startedAt;

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Server-Key': serverKey,
          'Content-Type': 'application/json'
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};

      if (payload?.message === 'You are being rate limited!' && attempt < 2) {
        const retryMs = Math.ceil(Number(payload.retry_after || 2) * 1000);
        await new Promise(r => setTimeout(r, retryMs));
        return this.execute(endpoint, options, attempt + 1, queuedAt);
      }

      const message = payload?.message || '';

      // Check for offline server error specifically
      if (response.status === 422 || (message && message.toLowerCase().includes('offline'))) {
        throw new ErlcApiError(message || 'The private server is currently offline.', {
          endpoint,
          status: response.status || 422
        });
      }

      if (!response.ok || (message && message !== 'Success')) {
        throw new ErlcApiError(message || `HTTP ${response.status}`, {
          endpoint,
          status: response.status,
          retryAfter: payload?.retry_after
        });
      }

      return payload;
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new ErlcApiError('ER:LC API request timed out.', { endpoint, status: 504 });
      }
      if (error instanceof ErlcApiError) throw error;
      throw new ErlcApiError('ER:LC API request failed.', { endpoint, cause: error.message, status: 502 });
    }
  }

  getServer(options = {}) {
    return this.request('/server', { cacheTtlMs: options.cacheTtlMs ?? 5000 });
  }

  getPlayers(options = {}) {
    return this.request('/server/players', { cacheTtlMs: options.cacheTtlMs ?? 5000 });
  }

  getKillLogs(options = {}) {
    return this.request('/server/killlogs', { cacheTtlMs: options.cacheTtlMs ?? 10000 });
  }

  getJoinLogs(options = {}) {
    return this.request('/server/joinlogs', { cacheTtlMs: options.cacheTtlMs ?? 15000 });
  }

  getCommandLogs(options = {}) {
    return this.request('/server/commandlogs', { cacheTtlMs: options.cacheTtlMs ?? 10000 });
  }

  getModCalls(options = {}) {
    return this.request('/server/modcalls', { cacheTtlMs: options.cacheTtlMs ?? 10000 });
  }

  runCommand(command) {
    return this.request('/server/command', {
      method: 'POST',
      body: { command },
      cacheTtlMs: 0
    });
  }
}

const erlcInstance = new ErlcService();

// Correlate !mod requests with staff :to / :tp responses
function matchModCalls(rawCalls, rawCommands) {
  const modCalls = [];
  const commandsList = Array.isArray(rawCommands) ? rawCommands : [];
  const callsList = Array.isArray(rawCalls) ? rawCalls : [];

  const seenKeys = new Set();

  // 1. Process structured mod calls from /server/modcalls
  for (const call of callsList) {
    const player = parseRobloxPlayer(call.Player || call.Caller || call.User);
    const id = String(call.Id || call.ID || call.CallId || call.CallID || `modcall_${player.name}_${call.Timestamp || Date.now()}`);
    const message = call.Message || call.MessageContent || call.Content || call.Reason || '!mod';
    const timestamp = Number(call.Timestamp) || Math.floor(Date.now() / 1000);

    seenKeys.add(`${player.name.toLowerCase()}_${timestamp}`);

    modCalls.push({
      id,
      requesterUsername: player.name,
      requesterRobloxUid: player.id,
      requestCommand: message.startsWith('!') || message.startsWith(':') ? message : `!mod ${message}`,
      requestedAt: timestamp,
      rawCaller: call.Player || call.Caller || call.User
    });
  }

  // 2. Also inspect in-game command logs for any "!mod" commands
  for (const entry of commandsList) {
    const cmd = String(entry.Command || '').trim();
    if (cmd.toLowerCase().startsWith('!mod') || cmd.toLowerCase().startsWith(':mod')) {
      const player = parseRobloxPlayer(entry.Player);
      const timestamp = Number(entry.Timestamp) || Math.floor(Date.now() / 1000);
      const key = `${player.name.toLowerCase()}_${timestamp}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        modCalls.push({
          id: `cmd_modcall_${player.name}_${timestamp}`,
          requesterUsername: player.name,
          requesterRobloxUid: player.id,
          requestCommand: cmd,
          requestedAt: timestamp,
          rawCaller: entry.Player
        });
      }
    }
  }

  // Sort mod calls chronologically (newest first)
  modCalls.sort((a, b) => b.requestedAt - a.requestedAt);

  const nowSeconds = Math.floor(Date.now() / 1000);

  // 3. Match each mod call with corresponding staff teleport command (:to <player>)
  return modCalls.map(call => {
    const reqNameLower = call.requesterUsername.toLowerCase();
    
    // Find matching teleport command executed after or right around requestedAt
    const matchingResponse = commandsList.find(c => {
      const cCmd = String(c.Command || '').trim().toLowerCase();
      const cTime = Number(c.Timestamp) || 0;
      
      // Match :to <player>, :tp <player>, or :bring <player>
      const isTeleportToPlayer = (
        cCmd.startsWith(`:to ${reqNameLower}`) ||
        cCmd.startsWith(`:tp ${reqNameLower}`) ||
        cCmd.startsWith(`:bring ${reqNameLower}`) ||
        cCmd === `:to ${reqNameLower}` ||
        cCmd === `:tp ${reqNameLower}`
      );

      // Response must occur around or after the request (within 30 minutes)
      const isAfterRequest = cTime >= (call.requestedAt - 10) && cTime <= (call.requestedAt + 1800);
      
      // Avoid matching if player teleported to themselves
      const staffPlayer = parseRobloxPlayer(c.Player);
      const isNotSelf = staffPlayer.name.toLowerCase() !== reqNameLower;

      return isTeleportToPlayer && isAfterRequest && isNotSelf;
    });

    if (matchingResponse) {
      const staff = parseRobloxPlayer(matchingResponse.Player);
      const respondedAt = Number(matchingResponse.Timestamp) || call.requestedAt;
      const responseTimeSeconds = Math.max(0, respondedAt - call.requestedAt);

      return {
        ...call,
        status: 'responded',
        staffUsername: staff.name,
        staffRobloxUid: staff.id,
        teleportCommand: matchingResponse.Command,
        respondedAt,
        responseTimeSeconds,
        serverId: 'NYSRP',
        createdAt: new Date(call.requestedAt * 1000).toISOString()
      };
    }

    // If not responded, check age
    const ageSeconds = nowSeconds - call.requestedAt;
    const isStillOpen = ageSeconds < 600; // Under 10 minutes

    return {
      ...call,
      status: isStillOpen ? 'open' : 'unresolved',
      staffUsername: null,
      staffRobloxUid: null,
      teleportCommand: null,
      respondedAt: null,
      responseTimeSeconds: null,
      serverId: 'NYSRP',
      createdAt: new Date(call.requestedAt * 1000).toISOString()
    };
  });
}

// HTTP Request handler for website backend
async function handleErlcApiRequest(req, res, sendJsonFn) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  const send = (status, payload) => {
    if (typeof sendJsonFn === 'function') {
      return sendJsonFn(res, status, payload);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  try {
    // 1. Server Info
    if (req.method === 'GET' && (pathname === '/api/erlc/server' || pathname === '/api/erlc/status')) {
      try {
        const server = await erlcInstance.getServer();
        return send(200, {
          online: Boolean(server && server.Name),
          offline: false,
          server: server || null,
          name: server?.Name || 'NYSRP ER:LC Server',
          currentPlayers: Number(server?.CurrentPlayers ?? 0),
          maxPlayers: Number(server?.MaxPlayers ?? 0),
          joinKey: server?.JoinKey || 'Unavailable',
          teamBalance: Boolean(server?.TeamBalance),
          accVerifiedReq: server?.AccVerifiedReq || 'Unknown',
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            server: null,
            name: 'NYSRP ER:LC Server (Offline)',
            currentPlayers: 0,
            maxPlayers: 0,
            joinKey: 'Unavailable',
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 2. Players
    if (req.method === 'GET' && pathname === '/api/erlc/players') {
      try {
        const rawPlayers = await erlcInstance.getPlayers();
        const players = Array.isArray(rawPlayers) ? rawPlayers.map(entry => {
          const parsed = parseRobloxPlayer(entry.Player);
          return {
            username: parsed.name,
            robloxId: parsed.id,
            permission: entry.Permission || 'Normal',
            team: entry.Team || 'Civilian',
            raw: entry.Player
          };
        }) : [];

        return send(200, {
          online: true,
          offline: false,
          count: players.length,
          players,
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            count: 0,
            players: [],
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 3. Kill Logs
    if (req.method === 'GET' && pathname === '/api/erlc/kills') {
      try {
        const rawKills = await erlcInstance.getKillLogs();
        const kills = Array.isArray(rawKills) ? rawKills.map(entry => {
          const killer = parseRobloxPlayer(entry.Killer);
          const victim = parseRobloxPlayer(entry.Killed);
          return {
            killerUsername: killer.name,
            killerRobloxUid: killer.id,
            victimUsername: victim.name,
            victimRobloxUid: victim.id,
            timestamp: entry.Timestamp || Math.floor(Date.now() / 1000),
            rawKiller: entry.Killer,
            rawKilled: entry.Killed
          };
        }) : [];

        return send(200, {
          online: true,
          offline: false,
          count: kills.length,
          kills,
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            count: 0,
            kills: [],
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 4. Join / Leave Logs
    if (req.method === 'GET' && pathname === '/api/erlc/joinlogs') {
      try {
        const rawJoins = await erlcInstance.getJoinLogs();
        const joins = Array.isArray(rawJoins) ? rawJoins.map(entry => {
          const player = parseRobloxPlayer(entry.Player);
          return {
            username: player.name,
            robloxUid: player.id,
            join: Boolean(entry.Join),
            timestamp: entry.Timestamp || Math.floor(Date.now() / 1000)
          };
        }) : [];

        return send(200, {
          online: true,
          offline: false,
          count: joins.length,
          joinLogs: joins,
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            count: 0,
            joinLogs: [],
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 5. In-Game Command Logs
    if (req.method === 'GET' && pathname === '/api/erlc/commandlogs') {
      try {
        const rawLogs = await erlcInstance.getCommandLogs();
        const commandLogs = Array.isArray(rawLogs) ? rawLogs.map(entry => {
          const player = parseRobloxPlayer(entry.Player);
          return {
            staffUsername: player.name,
            staffRobloxUid: player.id,
            command: entry.Command || '',
            timestamp: entry.Timestamp || Math.floor(Date.now() / 1000)
          };
        }) : [];

        return send(200, {
          online: true,
          offline: false,
          count: commandLogs.length,
          commandLogs,
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            count: 0,
            commandLogs: [],
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 6. Mod Calls
    if (req.method === 'GET' && pathname === '/api/erlc/modcalls') {
      try {
        const [rawCalls, rawCommands] = await Promise.all([
          erlcInstance.getModCalls().catch(() => []),
          erlcInstance.getCommandLogs().catch(() => [])
        ]);

        const modCalls = matchModCalls(rawCalls, rawCommands);

        return send(200, {
          online: true,
          offline: false,
          count: modCalls.length,
          modCalls,
          fetchedAt: new Date().toISOString()
        });
      } catch (err) {
        if (err.isOffline || err.details?.status === 422) {
          return send(200, {
            online: false,
            offline: true,
            count: 0,
            modCalls: [],
            message: 'The ER:LC private server is currently offline.',
            fetchedAt: new Date().toISOString()
          });
        }
        throw err;
      }
    }

    // 7. Execute Remote Command
    if (req.method === 'POST' && pathname === '/api/erlc/command') {
      let body = req.body;
      if (!body) {
        body = await new Promise((resolve, reject) => {
          let str = '';
          req.on('data', chunk => { str += chunk; });
          req.on('end', () => {
            try { resolve(JSON.parse(str || '{}')); } catch(e) { resolve({}); }
          });
          req.on('error', reject);
        });
      }

      const { command, staffRank, staffUsername, onDuty, robloxUsername, robloxId } = body;
      if (!command || typeof command !== 'string' || !command.trim()) {
        return send(400, { error: 'Command string is required' });
      }

      // Verify Rank Authorization
      const normalizedRank = String(staffRank || '').trim().toLowerCase();
      const authorizedRanks = ['owner', 'co owner', 'co-owner', 'director', 'management'];
      if (!authorizedRanks.includes(normalizedRank)) {
        return send(403, { error: 'Unauthorized: Only Management, Director, Co Owner, and Owner can execute ER:LC remote commands.' });
      }

      // Check Off-Duty Status and Dispatch Off-Duty Webhook Alert
      if (onDuty === false) {
        await sendOffDutyCommandAlert({
          staffName: staffUsername || 'Staff',
          staffRank: staffRank || 'Staff',
          robloxUsername: robloxUsername || staffUsername || null,
          robloxId: robloxId || null,
          command: command.trim(),
          source: 'Website Remote Control',
          timestamp: new Date().toISOString(),
          eventId: `offduty_web_${staffUsername || 'Staff'}_${Date.now()}_${encodeURIComponent(command.trim()).slice(0, 30)}`
        });
      }

      try {
        const result = await erlcInstance.runCommand(command.trim());
        return send(200, {
          success: true,
          command: command.trim(),
          result: result || { message: 'Command sent' },
          executedAt: new Date().toISOString()
        });
      } catch (err) {
        // Operational Error: Server Offline
        if (err.isOffline || err.details?.status === 422) {
          console.log(`[ER:LC Server] Remote command failed: Private server is currently offline (422) — command: "${command.trim()}" by ${staffUsername || 'Staff'}`);
          
          await sendDiscordErrorReport({
            title: 'ER:LC Server Offline',
            staffUsername: staffUsername || 'Staff',
            detail: `${staffUsername || 'Staff'}: The ER:LC private server is currently offline.`,
            system: 'NYSRP ER:LC Management System',
            endpoint: '/server/command',
            status: 422,
            command: command.trim()
          });

          return send(422, {
            success: false,
            offline: true,
            error: 'The ER:LC private server is currently offline. Please start the server and try again.',
            details: { status: 422, endpoint: '/server/command' }
          });
        }

        // Other command failure
        console.log(`[ER:LC Command Error] ${err.message || 'Command execution failed'}`);
        await sendDiscordErrorReport({
          title: 'ER:LC Command Failed',
          staffUsername: staffUsername || 'Staff',
          detail: `${staffUsername || 'Staff'}: ${err.message || 'Command execution failed'}`,
          system: 'NYSRP ER:LC Management System',
          endpoint: '/server/command',
          status: err.details?.status || 502,
          command: command.trim()
        });

        return send(err.details?.status || 502, {
          success: false,
          error: err.message || 'ER:LC API request failed',
          details: err.details || {}
        });
      }
    }

    // 8. In-Game Off-Duty Command Alert Endpoint
    if (req.method === 'POST' && pathname === '/api/erlc/offduty-alert') {
      let body = req.body;
      if (!body) {
        body = await new Promise((resolve) => {
          let str = '';
          req.on('data', chunk => { str += chunk; });
          req.on('end', () => {
            try { resolve(JSON.parse(str || '{}')); } catch(e) { resolve({}); }
          });
          req.on('error', () => resolve({}));
        });
      }

      await sendOffDutyCommandAlert({
        staffName: body.staffName || body.staffUsername || 'Staff',
        staffRank: body.staffRank || 'Staff',
        robloxUsername: body.robloxUsername || null,
        robloxId: body.robloxId || null,
        command: body.command || 'Unknown Command',
        source: body.source || 'ER:LC In-Game',
        timestamp: body.timestamp || new Date().toISOString(),
        eventId: body.eventId || null
      });

      return send(200, { success: true, alerted: true });
    }

    // 9. General Error Reporting Endpoint for Frontend / System Errors
    if (req.method === 'POST' && (pathname === '/api/report-error' || pathname === '/api/erlc/report-error')) {
      let body = req.body;
      if (!body) {
        body = await new Promise((resolve) => {
          let str = '';
          req.on('data', chunk => { str += chunk; });
          req.on('end', () => {
            try { resolve(JSON.parse(str || '{}')); } catch(e) { resolve({}); }
          });
          req.on('error', () => resolve({}));
        });
      }

      await sendDiscordErrorReport({
        title: body.title || 'System Error',
        staffUsername: body.staffUsername || body.user || 'Staff',
        detail: body.detail || body.message || 'A dashboard error occurred.',
        system: body.system || 'NYSRP Staff Dashboard',
        endpoint: body.endpoint || 'Client Interface',
        status: body.status || '500',
        command: body.command || null,
        extra: body.extra || null
      });

      return send(200, { success: true, reported: true });
    }

    return null; // Not an erlc or report route
  } catch (error) {
    // Only log true unexpected 500 crashes
    if (error.details?.status !== 422 && !error.isOffline) {
      console.error('[ER:LC API Server Error]', error.message || error);
    }
    const status = error.details?.status || (error instanceof ErlcApiError ? 502 : 500);
    return send(status, {
      error: error.message || 'ER:LC API request failed',
      details: error.details || {}
    });
  }
}

module.exports = {
  ErlcService,
  erlcInstance,
  parseRobloxPlayer,
  handleErlcApiRequest,
  sendDiscordErrorReport,
  sendOffDutyCommandAlert,
  escapeDiscordMentions,
  sanitizeSecrets,
  matchModCalls
};
