/**
 * Vercel Serverless Function: Neural Academic Translation Proxy
 * Provides fallback neural translation when client direct calls are blocked.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { texts, targetLang = "ko", sourceLang = "auto" } = req.body || {};
    const textList = Array.isArray(texts) ? texts : [texts];

    const translations = await Promise.all(
      textList.map(async (text) => {
        const clean = String(text || "").trim();
        if (!clean) return "";

        const params = new URLSearchParams({
          client: "gtx",
          sl: sourceLang,
          tl: targetLang,
          dt: "t",
          q: clean
        });

        const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MoonlightReader/1.0"
          }
        });

        if (!response.ok) return clean;
        const payload = await response.json();
        if (Array.isArray(payload) && Array.isArray(payload[0])) {
          return payload[0].map((seg) => seg[0] || "").join("");
        }
        return clean;
      })
    );

    return res.status(200).json({ ok: true, translations });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Translation proxy error" });
  }
}
