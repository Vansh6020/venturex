// VentureX problem-statement picker: the only server code.
// Storage: Upstash Redis, connected from Vercel -> Storage (it sets the env vars itself).
//   GET  /api/portal                                 -> live counts
//   POST /api/portal {action:"login", code}          -> team + counts
//   POST /api/portal {action:"claim", code, ps}      -> picks a track (atomic, max CAP per track)
const TEAMS = require('./_teams.js');

const CAP = 15;
const PROBLEMS = [
  { id: 1, title: 'Digital Empowerment of Local Restaurants',
    blurb: 'Help neighbourhood restaurants compete online: ordering, discovery, loyalty and operations for small kitchens.' },
  { id: 2, title: 'Agents That Get Work Done (Agentic AI)',
    blurb: 'Build AI agents that plan and carry out real multi-step tasks end to end, not just chat.' },
  { id: 3, title: 'Making Online Learning More Interactive',
    blurb: 'Turn passive video lectures into engaging, interactive and measurable learning experiences.' },
  { id: 4, title: 'Build the Super App (PingME)',
    blurb: 'Design PingME: one app that brings messaging, payments and everyday services together.' },
];
const CHOICES = 'vx:choices'; // hash: teamId -> JSON {ps, team, at}
const COUNTS = 'vx:counts';   // hash: ps -> number of teams

// Runs inside Redis as one step, so two teams can never both take the 15th seat.
const CLAIM_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 'ALREADY_CHOSEN' end
local n = tonumber(redis.call('HGET', KEYS[2], ARGV[2]) or '0')
if n >= tonumber(ARGV[3]) then return 'FULL' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
return 'OK'`;

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function status() {
  const flat = (await redis('HGETALL', COUNTS)) || [];
  const counts = {};
  for (let i = 0; i < flat.length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
  return { cap: CAP, problems: PROBLEMS.map(p => ({ ...p, taken: counts[p.id] || 0 })) };
}

async function teamView(t) {
  const raw = await redis('HGET', CHOICES, t.id);
  return { name: t.name, college: t.college, ps: raw ? JSON.parse(raw).ps : null };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => res.status(code).json(body);
  if (!URL_ || !TOKEN) return send(500, { error: 'NOT_CONFIGURED' });

  try {
    if (req.method === 'GET') return send(200, await status());
    if (req.method !== 'POST') return send(405, { error: 'METHOD' });

    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const team = TEAMS[String(body.code || '').trim().toUpperCase()];
    if (!team) return send(400, { error: 'INVALID_CODE' });

    if (body.action === 'login') {
      return send(200, { team: await teamView(team), ...(await status()) });
    }

    if (body.action === 'claim') {
      const ps = Number(body.ps);
      if (!PROBLEMS.some(p => p.id === ps)) return send(400, { error: 'BAD_PS' });
      const at = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const result = await redis('EVAL', CLAIM_LUA, 2, CHOICES, COUNTS, team.id, ps, CAP,
        JSON.stringify({ ps, team: team.name, at }));
      const payload = { team: await teamView(team), ...(await status()) };
      return result === 'OK' ? send(200, payload) : send(400, { error: result, ...payload });
    }

    return send(400, { error: 'BAD_ACTION' });
  } catch (e) {
    console.error(e);
    return send(500, { error: 'SERVER' });
  }
};
