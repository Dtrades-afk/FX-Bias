// Storage helper. Files starting with an underscore are not exposed as web addresses by Vercel.
// Works with Upstash Redis connected through the Vercel Marketplace. The integration adds either
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL / KV_REST_API_TOKEN.
// Vercel lets you add a custom prefix to these names (for example STORAGE_KV_REST_API_URL),
// so after the standard names this also looks for any variable ending in the same words.
function pick(names, re, not) {
  for (const n of names) if (process.env[n]) return process.env[n];
  const k = Object.keys(process.env).find(x => re.test(x) && !(not && not.test(x)));
  return k ? process.env[k] : undefined;
}
const URL_ = pick(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"], /(REST_API_URL|REDIS_REST_URL)$/);
const TOKEN = pick(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"], /(REST_API_TOKEN|REDIS_REST_TOKEN)$/, /READ_ONLY/);

// The order of inputs stored in each daily snapshot.
const INPUTS = ["rates", "infl", "yld", "cot", "news", "risk", "cb", "growth", "surprise"];

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
