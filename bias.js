// Runs on Vercel as a serverless function. Needs Node 18+ (built-in fetch).
const CUR = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];
const PAIRS = "EUR/USD GBP/USD AUD/USD NZD/USD USD/JPY USD/CAD USD/CHF EUR/GBP EUR/JPY GBP/JPY AUD/JPY EUR/AUD EUR/CAD EUR/CHF EUR/NZD GBP/AUD GBP/CAD GBP/CHF GBP/NZD AUD/CAD AUD/CHF AUD/NZD NZD/CAD NZD/CHF NZD/JPY CAD/JPY CHF/JPY CAD/CHF".split(" ");

// CONFIG: verify these IDs against the CFTC and FRED sites before relying on them.
const COT = { EUR: "099741", GBP: "096742", JPY: "097741", AUD: "232741", NZD: "112741", CAD: "090741", CHF: "092741", USD: "098662" };
// [FRED series id, lookback in observations]
const RATE = { USD: ["IRSTCI01USM156N", 3], EUR: ["IRSTCI01EZM156N", 3], GBP: ["IRSTCI01GBM156N", 3], JPY: ["IRSTCI01JPM156N", 3], AUD: ["IRSTCI01AUM156N", 3], NZD: ["IRSTCI01NZM156N", 3], CAD: ["IRSTCI01CAM156N", 3], CHF: ["IRSTCI01CHM156N", 3] };
const CPI = { USD: ["CPALTT01USM659N", 3], EUR: ["CPALTT01EZM659N", 3], GBP: ["CPALTT01GBM659N", 3], JPY: ["CPALTT01JPM659N", 3], AUD: ["CPALTT01AUQ659N", 1], NZD: ["CPALTT01NZQ659N", 1], CAD: ["CPALTT01CAM659N", 3], CHF: ["CPALTT01CHM659N", 3] };
const W = { rates: 1, infl: 1, cot: 1, news: 1 }; // news = 25% when all inputs exist
const TTL = { cot: 6 * 36e5, macro: 6 * 36e5, news: 30 * 6e4 };

const mem = {};
async function cached(key, ttl, fn) {
  const m = mem[key];
  if (m && Date.now() - m.t < ttl) return m.v;
  try { const v = await fn(); mem[key] = { t: Date.now(), v }; return v; }
  catch (e) { return m ? m.v : { error: String(e.message || e) }; }
}
const sign = (d, dead) => (d > dead ? 1 : d < -dead ? -1 : 0);
async function getJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(url.split("?")[0] + " returned " + r.status);
  return r.json();
}

async function fred(id, lb) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${lb + 3}`;
  const o = (await getJson(u)).observations.filter(x => x.value !== ".").map(x => +x.value);
  if (o.length <= lb) throw new Error("not enough data for " + id);
  return sign(o[0] - o[lb], 0.1);
}
const macro = () => cached("macro", TTL.macro, async () => {
  const out = {};
  for (const c of CUR) {
    out[c] = {};
    for (const [k, map] of [["rates", RATE], ["infl", CPI]]) {
      try { out[c][k] = await fred(...map[c]); } catch (e) { out[c][k] = null; }
    }
  }
  return out;
});

const cot = () => cached("cot", TTL.cot, async () => {
  const codes = Object.values(COT).map(c => `'${c}'`).join(",");
  const p = new URLSearchParams({ "$where": `cftc_contract_market_code in(${codes})`, "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": "40" });
  const rows = await getJson("https://publicreporting.cftc.gov/resource/6dca-aqww.json?" + p);
  const out = {};
  for (const c of CUR) {
    const r = rows.filter(x => x.cftc_contract_market_code === COT[c]).slice(0, 2);
    if (r.length < 2) { out[c] = null; continue; }
    const net = x => +x.noncomm_positions_long_all - +x.noncomm_positions_short_all;
    out[c] = sign(net(r[0]) - net(r[1]), 500);
  }
  return out;
});

const news = () => cached("news", TTL.news, async () => {
  const fk = process.env.FINNHUB_API_KEY, ak = process.env.ANTHROPIC_API_KEY;
  if (!fk || !ak) throw new Error("FINNHUB_API_KEY or ANTHROPIC_API_KEY missing");
  const raw = (await getJson(`https://finnhub.io/api/v1/news?category=forex&token=${fk}`)).slice(0, 40);
  const list = raw.map((n, i) => `${i}: ${n.headline}`).join("\n");
  const res = await getJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ak, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-5-5", max_tokens: 1500,
      system: "You tag forex headlines. For each, pick the single most affected currency from USD,EUR,GBP,JPY,AUD,NZD,CAD,CHF and a score from -1 to 1 (positive = bullish for that currency). Use c:null if irrelevant. Reply with a JSON array only, like [{\"i\":0,\"c\":\"USD\",\"s\":0.5}].",
      messages: [{ role: "user", content: list }]
    })
  });
  const tags = JSON.parse(res.content[0].text.replace(/```json|```/g, "").trim());
  const sum = {}, wt = {}, items = [];
  for (const t of tags) {
    const n = raw[t.i];
    if (!n || !CUR.includes(t.c)) continue;
    const w = Math.pow(0.5, (Date.now() / 1000 - n.datetime) / 3600 / 24); // 24h half-life
    sum[t.c] = (sum[t.c] || 0) + w * t.s; wt[t.c] = (wt[t.c] || 0) + w;
    items.push({ headline: n.headline, source: n.source, url: n.url, c: t.c, s: t.s });
  }
  const scores = {};
  for (const c of CUR) scores[c] = wt[c] ? Math.max(-1, Math.min(1, sum[c] / (wt[c] + 1))) : null; // +1 shrinks thin evidence toward 0
  return { scores, items };
});

const level = g => (g >= 50 ? "Very bullish" : g >= 25 ? "Bullish" : g <= -50 ? "Very bearish" : g <= -25 ? "Bearish" : "Neutral");

module.exports = async (req, res) => {
  if (process.env.ACCESS_KEY && req.query.key !== process.env.ACCESS_KEY) {
    res.status(401).json({ error: "Access key required" });
    return;
  }
  const [m, c, n] = await Promise.all([macro(), cot(), news()]);
  const status = { macro: m.error ? m.error : "ok", cot: c.error ? c.error : "ok", news: n.error ? n.error : "ok" };
  const currencies = {};
  for (const cu of CUR) {
    const comps = {
      rates: m.error ? null : m[cu].rates,
      infl: m.error ? null : m[cu].infl,
      cot: c.error ? null : c[cu],
      news: n.error ? null : n.scores[cu]
    };
    let t = 0, w = 0;
    for (const k in comps) if (comps[k] !== null) { t += W[k] * comps[k]; w += W[k]; }
    currencies[cu] = { score: w ? Math.round((t / w) * 100) : 0, comps };
  }
  const pairs = PAIRS.map(p => {
    const [b, q] = p.split("/");
    const gap = Math.round((currencies[b].score - currencies[q].score) / 2);
    return { pair: p, gap, level: level(gap) };
  });
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ updated: new Date().toISOString(), status, currencies, pairs, headlines: n.error ? [] : n.items });
};
