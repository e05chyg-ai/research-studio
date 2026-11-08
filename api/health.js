/**
 * Vercel Serverless Function: Health Check Endpoint
 * Allows frontend to automatically detect whether cloud/proxy backend features are online.
 */
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return res.status(200).json({
    ok: true,
    status: "online",
    service: "Moonlight AI Research Studio Cloud Services",
    timestamp: Date.now()
  });
}
