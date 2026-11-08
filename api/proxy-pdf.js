/**
 * Vercel Serverless Function: Remote PDF Fetcher & CORS Proxy
 * Enables client-side Mozilla PDF.js to load arXiv / OpenAccess PDFs without browser CORS blocking.
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing 'url' query parameter" });
  }

  try {
    const targetUrl = decodeURIComponent(url);

    // Validate target protocol
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      return res.status(400).json({ error: "Invalid URL protocol. Must be HTTP or HTTPS." });
    }

    const resp = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 MoonlightReader/1.0",
        "Accept": "application/pdf,application/octet-stream,*/*"
      }
    });

    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Remote server responded with ${resp.status}: ${resp.statusText}` });
    }

    const contentType = resp.headers.get("content-type") || "application/pdf";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");

    const arrayBuffer = await resp.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch remote PDF" });
  }
}
