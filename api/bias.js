// Runs on Vercel as a serverless function. Needs Node 18+ (built-in fetch).
// Runs on Vercel as a serverless function. Needs Node 18+ (built-in fetch).
const { redis, INPUTS } = require("./_store");
const CUR = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];
const PAIRS = "EUR/USD GBP/USD AUD/USD NZD/USD USD/JPY USD/CAD USD/CHF EUR/GBP EUR/JPY GBP/JPY AUD/JPY EUR/AUD EUR/CAD EUR/CHF EUR/NZD GBP/AUD GBP/CAD GBP/CHF GBP/NZD AUD/CAD AUD/CHF AUD/NZD NZD/CAD NZD/CHF NZD/JPY CAD/JPY CHF/JPY CAD/CHF XAU/USD XAG/USD".split(" ");
const METALS = ["XAU", "XAG"];

// CONFIG: verify these IDs against the CFTC and FRED sites before relying on them.
const COT = { EUR: "099741", GBP: "096742", JPY: "097741", AUD: "232741", NZD: "112741", CAD: "090741", CHF: "092741", USD: "098662", XAU: "088691", XAG: "084691" };
// [FRED series id, lookback in observations]
const RATE = { USD: ["IRSTCI01USM156N", 3], EUR: ["IRSTCI01EZM156N", 3], GBP: ["IRSTCI01GBM156N", 3], JPY: ["IRSTCI01JPM156N", 3], AUD: ["IRSTCI01AUM156N", 3], NZD: ["IRSTCI01NZM156N", 3], CAD: ["IRSTCI01CAM156N", 3], CHF: ["IRSTCI01CHM156N", 3] };
const CPI = { USD: ["CPALTT01USM659N", 3], EUR: ["CPALTT01EZM659N", 3], GBP: ["CPALTT01GBM659N", 3], JPY: ["CPALTT01JPM659N", 3], AUD: ["CPALTT01AUQ659N", 1], NZD: ["CPALTT01NZQ659N", 1], CAD: ["CPALTT01CAM659N", 3], CHF: ["CPALTT01CHM659N", 3] };
const W = { rates: 1, infl: 1, yld: 1, cot: 1, news: 1, risk: 1 }; // equal weights; news is about 17% when all inputs exist
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
  const p = new URLSearchParams({ "$where": `cftc_contract_market_code in(${codes})`, "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": "700" });
  const rows = await getJson("https://publicreporting.cftc.gov/resource/6dca-aqww.json?" + p);
  const out = {};
  const pct = {}, table = [];
  for (const c of Object.keys(COT)) {
    const r = rows.filter(x => x.cftc_contract_market_code === COT[c]).slice(0, 52);
    if (r.length < 2) { out[c] = null; pct[c] = null; continue; }
    const net = x => +x.noncomm_positions_long_all - +x.noncomm_positions_short_all;
    const chg = sign(net(r[0]) - net(r[1]), 500);
    const pc = Math.round((100 * r.filter(x => net(x) <= net(r[0])).length) / r.length);
    pct[c] = r.length >= 26 ? pc : null; // needs at least 26 weeks of history
    // Crowded positioning (top or bottom 10% of the past year) halves a signal that adds to the crowd.
    const crowded = pct[c] !== null && ((chg > 0 && pc >= 90) || (chg < 0 && pc <= 10));
    out[c] = crowded ? chg * 0.5 : chg;
    // Table row: week-on-week changes come from the two latest reports. Net % change is the change in the long share, in percentage points.
    const L0 = +r[0].noncomm_positions_long_all, S0 = +r[0].noncomm_positions_short_all;
    const L1 = +r[1].noncomm_positions_long_all, S1 = +r[1].noncomm_positions_short_all;
    const lp0 = (L0 / (L0 + S0)) * 100, lp1 = (L1 / (L1 + S1)) * 100;
    table.push({
      sym: c === "XAU" ? "Gold" : c === "XAG" ? "Silver" : c, date: r[0].report_date_as_yyyy_mm_dd,
      long: L0, short: S0, dLong: L0 - L1, dShort: S0 - S1, longPct: lp0, shortPct: 100 - lp0, netPctChg: lp0 - lp1,
      net: L0 - S0, oi: +r[0].open_interest_all, dOi: +r[0].open_interest_all - +r[1].open_interest_all
    });
  }
  return { vals: out, pct, table };
});

const news = () => cached("news", TTL.news, async () => {
  const fk = process.env.FINNHUB_API_KEY, ak = process.env.ANTHROPIC_API_KEY;
  if (!fk) throw new Error("FINNHUB_API_KEY missing");
  const raw = (await getJson(`https://finnhub.io/api/v1/news?category=forex&token=${fk}`)).slice(0, 40);
  if (!ak) {
    const scores = {};
    CUR.forEach(c => (scores[c] = null));
    return { scores, unscored: true, items: raw.map(n => ({ headline: n.headline, source: n.source, url: n.url })) };
  }
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

// 2-year government bond yields. Free daily sources are wired for USD, EUR and CAD only.
// GBP, JPY, AUD, NZD and CHF have no source yet, so their yield input stays empty.
// Verify these IDs on each provider's site before relying on them.
const YLD = {
  USD: ["fred", "DGS2"], EUR: ["ecb", "B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y"], CAD: ["boc", "BD.CDN.2YR.DQ.YLD"],
  JPY: ["mof"], AUD: ["rba"], CHF: ["snb"] // official daily files; the layouts below are unverified, so a failure just leaves that currency empty
};
const YERR = {}; // last error per currency, shown in the status so a broken source is easy to spot
const UA = { "User-Agent": "Mozilla/5.0 (compatible; MacroEdge/1.0)" };
async function getText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(url.split("?")[0] + " returned " + r.status);
  return r.text();
}
const csvRows = (txt, sep = ",") => txt.split(/\r?\n/).map(l => l.split(sep).map(s => s.trim().replace(/^"|"$/g, "")));
const oldestFirst = pairs => pairs.filter(p => p.k && !isNaN(p.v)).sort((a, b) => a.k - b.k).map(p => p.v);
const dkey = s => { const m = String(s).match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };

// Japan: Ministry of Finance daily JGB yields (English CSV)
async function jgb2y() {
  let txt, last;
  for (const u of ["https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv", "https://www.mof.go.jp/english/jgbs/reference/interest_rate/jgbcme.csv"]) {
    try { txt = await getText(u); break; } catch (e) { last = e; }
  }
  if (!txt) throw last;
  const rows = csvRows(txt), hi = rows.findIndex(r => /^date$/i.test(r[0]));
  if (hi < 0) throw new Error("unexpected JGB file layout");
  const col = rows[hi].findIndex(c => /^2\s*y?$/i.test(c));
  if (col < 0) throw new Error("no 2-year column in the JGB file");
  return oldestFirst(rows.slice(hi + 1).map(r => ({ k: dkey(r[0]), v: parseFloat(r[col]) })));
}
// Australia: RBA table F2, series FCMYGBAG2 (Australian Government 2-year bond)
async function rba2y() {
  const rows = csvRows(await getText("https://www.rba.gov.au/statistics/tables/csv/f2-data.csv"));
  const si = rows.findIndex(r => /^series id$/i.test(r[0]));
  if (si < 0) throw new Error("unexpected RBA file layout");
  const col = rows[si].findIndex(c => c === "FCMYGBAG2");
  if (col < 0) throw new Error("2-year series not found in the RBA file");
  return oldestFirst(rows.slice(si + 1).filter(r => /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(r[0]))
    .map(r => ({ k: Date.parse(r[0].replace(/-/g, " ")) || 0, v: parseFloat(r[col]) })));
}
// Switzerland: SNB data portal, daily yields on Swiss Confederation bonds (2-year = code 2J)
async function snb2y() {
  const rows = csvRows(await getText("https://data.snb.ch/api/cube/rendoblid/data/csv/en"), ";");
  const hi = rows.findIndex(r => r[0] === "Date" && r.length >= 3);
  if (hi < 0) throw new Error("unexpected SNB file layout");
  return oldestFirst(rows.slice(hi + 1).filter(r => r[1] === "2J").map(r => ({ k: dkey(r[0]), v: parseFloat(r[2]) })));
}
async function yieldSeries(src, id) { // returns values oldest to newest
  if (src === "mof") return jgb2y();
  if (src === "rba") return rba2y();
  if (src === "snb") return snb2y();
  if (src === "fred") {
    const key = process.env.FRED_API_KEY;
    if (!key) throw new Error("FRED_API_KEY missing");
    const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=40`);
    return j.observations.filter(x => x.value !== ".").map(x => +x.value).reverse();
  }
  if (src === "ecb") {
    const j = await getJson(`https://data-api.ecb.europa.eu/service/data/YC/${id}?lastNObservations=30&format=jsondata`);
    const o = Object.values(j.dataSets[0].series)[0].observations;
    return Object.keys(o).sort((a, b) => a - b).map(k => o[k][0]);
  }
  const j = await getJson(`https://www.bankofcanada.ca/valet/observations/${id}/json?recent=30`);
  return j.observations.map(x => +x[id].v).filter(v => !isNaN(v));
}
const yields = () => cached("yld", TTL.macro, async () => {
  const out = {};
  for (const c of CUR) {
    out[c] = null;
    if (!YLD[c]) continue;
    try {
      const v = await yieldSeries(...YLD[c]);
      if (v.length > 20) { out[c] = { last: v[v.length - 1], chg: v[v.length - 1] - v[v.length - 21] }; delete YERR[c]; } // change over about 4 weeks
      else YERR[c] = "only " + v.length + " data points found";
    } catch (e) { YERR[c] = String(e.message || e).slice(0, 120); }
  }
  return out;
});

// Risk tone from the VIX and the S&P 500 (both daily on FRED). Positive = risk-on, negative = risk-off.
// How strongly each currency reacts is my starting assumption: untested, so adjust once you have scorecard results.
const SENS = { AUD: 1, NZD: 1, CAD: 0.5, GBP: 0.25, EUR: 0, USD: -0.25, JPY: -1, CHF: -1 };
async function fredRecent(id, n) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY missing");
  const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${n + 10}`);
  return j.observations.filter(x => x.value !== ".").map(x => +x.value).reverse();
}
const risk = () => cached("risk", TTL.macro, async () => {
  const [vix, spx] = await Promise.all([fredRecent("VIXCLS", 5), fredRecent("SP500", 50)]);
  if (!vix.length || spx.length < 40) throw new Error("not enough VIX or S&P 500 data");
  const v = vix[vix.length - 1], last = spx[spx.length - 1], win = spx.slice(-50);
  const ma = win.reduce((a, b) => a + b, 0) / win.length;
  const vixSig = v < 16 ? 1 : v > 24 ? -1 : 0;
  const spxSig = last > ma * 1.01 ? 1 : last < ma * 0.99 ? -1 : 0;
  return { tone: (vixSig + spxSig) / 2, vix: v, spx: last, ma };
});

// Retail positioning from the Myfxbook API (needs a free Myfxbook account). Display only, not part of the bias score.
// Cached for 20 minutes because Myfxbook limits how often the outlook can be requested.
const outlook = () => cached("outlook", 20 * 6e4, async () => {
  const em = (process.env.MYFXBOOK_EMAIL || "").trim(), pw = (process.env.MYFXBOOK_PASSWORD || "").trim();
  if (!em || !pw) throw new Error("MYFXBOOK_EMAIL or MYFXBOOK_PASSWORD not set");
  const base = "https://www.myfxbook.com/api/";
  const l = await getJson(`${base}login.json?email=${encodeURIComponent(em)}&password=${encodeURIComponent(pw)}`);
  if (l.error || !l.session) throw new Error("Myfxbook login failed: " + (l.message || "check the email and password"));
  const ses = encodeURIComponent(l.session);
  try {
    const j = await getJson(`${base}get-community-outlook.json?session=${ses}`);
    if (j.error) throw new Error("Myfxbook: " + (j.message || "request failed"));
    // Field names follow Myfxbook's API documentation. Verify them if a column shows empty.
    return (j.symbols || []).map(s => ({
      name: s.name, shortPct: +s.shortPercentage, longPct: +s.longPercentage,
      shortPos: +s.shortPositions, longPos: +s.longPositions,
      shortLots: +s.shortVolume, longLots: +s.longVolume, total: +s.totalPositions,
      avgShort: +s.avgShortPrice, avgLong: +s.avgLongPrice
    }));
  } finally {
    getJson(`${base}logout.json?session=${ses}`).catch(() => {});
  }
});

// Saves one snapshot per day (the first visit of the day) so the scorecard has a permanent, hindsight-free record.
// If storage is not connected this quietly does nothing and the site works as before.
let savedDay = "", saveNote = "not attempted yet";
async function saveSnapshot(currencies, pairs) {
  const day = new Date().toISOString().slice(0, 10);
  if (savedDay === day) { saveNote = "ok"; return; }
  try {
    const cur = {};
    for (const k in currencies) {
      const v = currencies[k];
      cur[k] = [v.score, ...INPUTS.map(i => (v.comps[i] === undefined ? null : v.comps[i]))];
    }
    await redis(["HSETNX", "snaps", day, JSON.stringify({ pairs: pairs.map(p => [p.pair, p.gap, p.level]), cur })]);
    savedDay = day;
    saveNote = "ok";
  } catch (e) { saveNote = "could not save: " + String(e.message || e); }
}

const level = g => (g >= 50 ? "Very bullish" : g >= 25 ? "Bullish" : g <= -50 ? "Very bearish" : g <= -25 ? "Bearish" : "Neutral");

module.exports = async (req, res) => {
  if (process.env.ACCESS_KEY && req.query.key !== process.env.ACCESS_KEY) {
    res.status(401).json({ error: "Access key required" });
    return;
  }
  const [m, c, n, y, r, rt] = await Promise.all([macro(), cot(), news(), yields(), risk(), outlook()]);
  const miss = CUR.filter(x => y.error || !y[x]);
  const status = { retail: rt.error ? rt.error : "ok", risk: r.error ? r.error : "ok", yields: miss.length ? "no data for " + miss.join(", ") : "ok", macro: m.error ? m.error : "ok", cot: c.error ? c.error : "ok", news: n.error ? n.error : n.unscored ? "headlines only, scoring needs ANTHROPIC_API_KEY" : "ok" };
  const currencies = {};
  for (const cu of CUR) {
    const comps = {
      rates: m.error ? null : m[cu].rates,
      infl: m.error ? null : m[cu].infl,
      yld: y.error || !y[cu] ? null : sign(y[cu].chg, 0.1), // +/-1 if the 2y yield moved more than 10bp in about 4 weeks
      risk: r.error ? null : Math.round(r.tone * SENS[cu] * 100) / 100,
      cot: c.error ? null : c.vals[cu],
      news: n.error ? null : n.scores[cu]
    };
    let t = 0, w = 0;
    for (const k in comps) if (comps[k] !== null) { t += W[k] * comps[k]; w += W[k]; }
    currencies[cu] = { score: w ? Math.round((t / w) * 100) : 0, comps, cotPct: c.error ? null : c.pct[cu], yield2y: y.error || !y[cu] ? null : y[cu].last };
  }
  // Metals: own COT positioning only. A neutral prior of weight 1 damps the score (max +/-50),
  // because the dollar side of XAU/USD and XAG/USD already carries rates and inflation.
  for (const a of METALS) {
    const ct = c.error ? null : c.vals[a];
    currencies[a] = { score: ct === null ? 0 : Math.round((ct / 2) * 100), comps: { rates: null, infl: null, cot: ct, news: null }, cotPct: c.error ? null : c.pct[a] };
  }
  const pairs = PAIRS.map(p => {
    const [b, q] = p.split("/");
    const gap = Math.round((currencies[b].score - currencies[q].score) / 2);
    return { pair: p, gap, level: level(gap) };
  });
  if (!m.error && !c.error) await saveSnapshot(currencies, pairs); else saveNote = "skipped: macro or COT data did not load";
  status.storage = saveNote;
  const yerr = Object.entries(YERR).map(([k, v]) => k + ": " + v).join("; ");
  if (yerr) status.yieldErrors = yerr;
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ updated: new Date().toISOString(), status, risk: r.error ? null : r, retail: rt.error ? null : { symbols: rt }, cotTable: c.error ? null : c.table, currencies, pairs, headlines: n.error ? [] : n.items });
};
