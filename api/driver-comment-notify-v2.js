const originalHandler = require("./driver-comment-notify");

module.exports = async function handler(req, res) {
  if (req.method === "POST") {
    const driverName = String(req.body?.driverName || "").trim();
    if (!driverName) {
      console.log("Skipped duplicate Driver comment notification without driver name");
      return res.status(200).json({ ok: true, skipped: true });
    }
  }

  return originalHandler(req, res);
};
