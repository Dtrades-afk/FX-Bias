// Reads and writes the inputs you set by hand: central bank stance, data surprises and key price levels.
const { redis } = require("./_store");
const KEYS = ["stance", "surprise", "levels"];

module.exports = async (req, res) => {
  if (process.env.ACCESS_KEY && req.query.key !== process.env.ACCESS_KEY) {
    res.status(401).json({ error: "Access key required" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const text = JSON.stringify(b.value);
      if (!KEYS.includes(b.key) || !b.value || typeof b.value !== "object" || text.length > 20000) {
        res.status(400).json({ error: "bad request" });
        return;
      }
      await redis(["HSET", "settings", b.key, text]);
      res.status(200).json({ ok: true });
      return;
    }
    const flat = await redis(["HGETALL", "settings"]);
    const out = { stance: {}, surprise: {}, levels: {} };
    for (let i = 0; i < flat.length; i += 2) { try { out[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) { /* skip */ } }
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ error: String(e.message || e), stance: {}, surprise: {}, levels: {} });
  }
};
