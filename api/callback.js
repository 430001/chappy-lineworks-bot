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

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(unsignedToken),
    privateKey
  );

  return `${unsignedToken}.${base64url(signature)}`;
}

async function getAccessToken() {
  const clientId = process.env.LINEWORKS_CLIENT_ID;
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
  const privateKey = process.env.LINEWORKS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientId || !clientSecret || !serviceAccount || !privateKey) {
    throw new Error("LINE WORKS authentication settings are missing");
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
  console.error(
    "Token error detail:",
    JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      data: data
    })
  );
 console.error("Token error detail:", JSON.stringify(data));
    throw new Error("Failed to get LINE WORKS access token");
  }

  return data.access_token;
}

async function askChappy(userText) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        instructions:
          "あなたは社内業務をサポートするAIアシスタント「チャッピー」です。日本語で、わかりやすく簡潔に回答してください。",
        input: userText
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenAI API error:", response.status, data);
    throw new Error("OpenAI API request failed");
  }

  return data.output_text || "うまく回答を作れませんでした。";
}async function sendMessage(userId, text) {
  const botId = process.env.LINEWORKS_BOT_ID;

  if (!botId) {
    throw new Error("LINEWORKS_BOT_ID is not set");
  }

  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(
      botId
    )}/users/${encodeURIComponent(userId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    const errorText = await response.text();
    console.error("Send message error:", response.status, errorText);
    throw new Error("Failed to send LINE WORKS message");
  }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "chappy-lineworks-bot"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const botSecret = process.env.LINEWORKS_BOT_SECRET;

  if (!botSecret) {
    console.error("LINEWORKS_BOT_SECRET is not set");
    return res.status(500).json({
      error: "Server configuration error"
    });
  }

  const body =
    typeof req.body === "string"
      ? req.body
      : JSON.stringify(req.body || {});

  const receivedSignature =
    req.headers["x-works-signature"];

  const calculatedSignature = crypto
    .createHmac("sha256", botSecret)
    .update(body, "utf8")
    .digest("base64");

  if (
    !receivedSignature ||
    receivedSignature !== calculatedSignature
  ) {
    console.error("Invalid LINE WORKS signature");

    return res.status(401).json({
      error: "Invalid signature"
    });
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

  try {
    if (
      event?.type === "message" &&
      event?.content?.type === "text" &&
      event?.source?.userId
    ) {
      const receivedText = event.content.text || "";

      const aiReply = await askChappy(receivedText);

await sendMessage(event.source.userId, aiReply);
    }
  } catch (error) {
    console.error("Bot reply error:", error);
  }

  return res.status(200).json({
    ok: true
  });
};
