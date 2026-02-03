// netlify/functions/get-sentinel-token.js
const TOKEN_URL = "https://services.sentinel-hub.com/oauth/token";

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...extraHeaders
    },
    body: JSON.stringify(bodyObj)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      }
    };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  // Acepta ambos nombres por si acaso
  const clientId =
    process.env.SENTINELHUB_CLIENT_ID ||
    process.env.SENTINEL_CLIENT_ID;

  const clientSecret =
    process.env.SENTINELHUB_CLIENT_SECRET ||
    process.env.SENTINEL_CLIENT_SECRET;

  const missing = [];
  if (!clientId) missing.push("SENTINELHUB_CLIENT_ID (o SENTINEL_CLIENT_ID)");
  if (!clientSecret) missing.push("SENTINELHUB_CLIENT_SECRET (o SENTINEL_CLIENT_SECRET)");

  if (missing.length) {
    return json(500, { error: "Faltan variables de entorno", missing });
  }

  try {
    const resp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    const data = await resp.json();

    if (!resp.ok) return json(resp.status, { error: "OAuth error", details: data });
    if (!data.access_token) return json(502, { error: "Sin access_token", details: data });

    return json(200, data);
  } catch (err) {
    return json(500, { error: "Fallo al solicitar token", details: err.message });
  }
};
