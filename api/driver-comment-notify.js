const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createJwt(clientId, serviceAccount, privateKey) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600
  };

  const unsigned =
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(unsigned),
    privateKey
  );

  return `${unsigned}.${base64url(signature)}`;
}

async function getAccessToken() {
  const clientId = process.env.LINEWORKS_CLIENT_ID;
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
  const privateKey =
    process.env.LINEWORKS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientId || !clientSecret || !serviceAccount || !privateKey) {
    throw new Error("LINE WORKS settings missing");
  }

  const assertion = createJwt(
    clientId,
    serviceAccount,
    privateKey
  );

  const body = new URLSearchParams({
    assertion,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "bot"
  });

  const response = await fetch(
    "https://auth.worksmobile.com/oauth2/v2.0/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("LINE WORKS token error");
  }

  return data.access_token;
}

async function sendMessage(userId, text) {
  const botId = process.env.LINEWORKS_BOT_ID;
  const token = await getAccessToken();

  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(botId)}/users/${encodeURIComponent(userId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: {
          type: "text",
          text
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error("LINE WORKS send error");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const secret = req.headers["x-chappy-notify-secret"];

  if (
    !process.env.CHAPPY_NOTIFY_SECRET ||
    secret !== process.env.CHAPPY_NOTIFY_SECRET
  ) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
    });
  }

  try {
    const {
      driverName,
      customerName,
      customerCode,
      course,
      comment
    } = req.body || {};

    if (!String(comment || "").trim()) {
      return res.status(400).json({
        ok: false,
        error: "comment required"
      });
    }

    const userId = process.env.LINEWORKS_NOTIFY_USER_ID;

    if (!userId) {
      throw new Error("Notify user not configured");
    }

    const text =
`🚨 Driverコメント

DR：${driverName || "-"}
コース：${course || "-"}
お客様：${customerName || "-"}
顧客コード：${customerCode || "-"}

コメント：
${comment}

時刻：${new Date().toLocaleString("ja-JP", {
  timeZone: "Asia/Tokyo"
})}`;

    await sendMessage(userId, text);

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Driver comment notify error:", error);

    return res.status(500).json({
      ok: false
    });
  }
};
