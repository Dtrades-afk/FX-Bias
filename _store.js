// Storage helper. Files starting with an underscore are not exposed as web addresses by Vercel.
// Works with Upstash Redis connected through the Vercel Marketplace. The integration adds either
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL / KV_REST_API_TOKEN.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// The order of inputs stored in each daily snapshot.
const INPUTS = ["rates", "infl", "yld", "cot", "news", "risk"];

async function redis(cmd) {
  if (!URL_ || !TOKEN) throw new Error("storage not connected");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "storage returned " + r.status);
  return j.result;
}

module.exports = { redis, INPUTS };
