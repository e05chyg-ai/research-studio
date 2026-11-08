"""
Custom AI Research Platform — Local Python Backend Server
Provides:
1. Static web hosting at http://localhost:8080
2. /api/proxy-pdf?url=<arxiv_or_pdf_url> — CORS-free remote PDF fetching for direct arXiv / OpenAccess loading
3. /api/translate (POST) — Neural academic text translation fallback proxy
4. /api/health — Backend health check for frontend auto-detection
"""

import http.server
import json
import socketserver
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

PORT = 8080
ROOT_DIR = Path(__file__).resolve().parent


def translate_single_chunk(text: str, target_lang: str = "ko", source_lang: str = "auto") -> str:
    clean = (text or "").strip()
    if not clean:
        return ""
    params = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": source_lang,
            "tl": target_lang,
            "dt": "t",
            "q": clean,
        }
    )
    url = f"https://translate.googleapis.com/translate_a/single?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ResearchReader/1.0"
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if isinstance(payload, list) and payload and isinstance(payload[0], list):
        return "".join(seg[0] for seg in payload[0] if isinstance(seg, list) and seg and seg[0])
    return clean


class ResearchPlatformHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/translate":
            try:
                content_len = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
                data = json.loads(raw_body)
                texts = data.get("texts") or []
                target_lang = (data.get("targetLang") or "ko").strip()
                source_lang = (data.get("sourceLang") or "auto").strip()

                if not isinstance(texts, list):
                    texts = [str(texts)]

                separator = "\n[[[SEG_SPLIT]]]\n"
                translations = []
                batch = []
                batch_len = 0

                def flush_batch(items):
                    if not items:
                        return []
                    joined = separator.join(items)
                    translated_joined = translate_single_chunk(joined, target_lang, source_lang)
                    parts = [p.strip() for p in translated_joined.split("[[[SEG_SPLIT]]]")]
                    if len(parts) == len(items):
                        return parts
                    return [translate_single_chunk(it, target_lang, source_lang) for it in items]

                for item in texts:
                    s = str(item or "")
                    if batch and batch_len + len(s) > 1800:
                        translations.extend(flush_batch(batch))
                        batch = []
                        batch_len = 0
                    batch.append(s)
                    batch_len += len(s)

                if batch:
                    translations.extend(flush_batch(batch))

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"ok": True, "translations": translations}, ensure_ascii=False).encode("utf-8")
                )
            except Exception as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "service": "CustomResearchBackend"}).encode("utf-8"))
            return

        if parsed.path == "/api/proxy-pdf":
            qs = urllib.parse.parse_qs(parsed.query)
            target_url = (qs.get("url") or [""])[0].strip()

            # Normalize arXiv abstract URLs to direct PDF URLs
            if "arxiv.org/abs/" in target_url:
                target_url = target_url.replace("arxiv.org/abs/", "arxiv.org/pdf/")
                if not target_url.endswith(".pdf"):
                    target_url += ".pdf"

            parsed_target = urllib.parse.urlparse(target_url)
            host = (parsed_target.hostname or "").lower()
            if not target_url.startswith(("http://", "https://")) or host in ("localhost", "127.0.0.1", "::1"):
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "유효한 외부 http/https PDF URL이 필요합니다."}).encode("utf-8"))
                return

            try:
                req = urllib.request.Request(
                    target_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ResearchReader/1.0"
                    },
                )
                with urllib.request.urlopen(req, timeout=25) as resp:
                    pdf_bytes = resp.read()

                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(len(pdf_bytes)))
                self.end_headers()
                self.wfile.write(pdf_bytes)
            except Exception as exc:
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return

        return super().do_GET()


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), ResearchPlatformHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"============================================================")
        print(f" 🚀 나만의 AI 논문 연구 스튜디오 서버 실행 중: {url}")
        print(f" 📄 원격 arXiv / PDF 프록시 & 신경망 번역 엔진 활성화됨")
        print(f"============================================================")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
