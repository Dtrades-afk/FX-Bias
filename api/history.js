// Returns every saved daily snapshot so the scorecard can work from a permanent record.
const { redis, INPUTS } = require("./_store");

module.exports = async (req, res) => {
  if (process.env.ACCESS_KEY && req.query.key !== process.env.ACCESS_KEY) {
    res.status(401).json({ error: "Access key required" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const flat = await redis(["HGETALL", "snaps"]); // [date, json, date, json, ...]
    const days = {};
    for (let i = 0; i < flat.length; i += 2) {
      try { days[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) { /* skip a damaged entry */ }
    }
    res.status(200).json({ inputs: INPUTS, days });
  } catch (e) {
    res.status(200).json({ inputs: INPUTS, days: null, error: String(e.message || e) });
  }
};
