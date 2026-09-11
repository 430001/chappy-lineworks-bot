const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "chappy-lineworks-bot"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const botSecret = process.env.LINEWORKS_BOT_SECRET;

  if (!botSecret) {
    console.error("LINEWORKS_BOT_SECRET is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const body =
    typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body || {});

  const receivedSignature = req.headers["x-works-signature"];

  const calculatedSignature = crypto
    .createHmac("sha256", botSecret)
    .update(body, "utf8")
    .digest("base64");

  if (
    !receivedSignature ||
    receivedSignature !== calculatedSignature
  ) {
    console.error("Invalid LINE WORKS signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event =
    typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

  console.log("LINE WORKS callback received:", {
    type: event?.type,
    source: event?.source,
    contentType: event?.content?.type
  });

  return res.status(200).json({ ok: true });
};
