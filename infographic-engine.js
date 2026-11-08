// Custom AI Research Platform — Passage-to-Infographic Visual Synthesis Engine
// Generates high-resolution SVG/PNG academic infographics from selected paper excerpts

class InfographicGenerator {
  /**
   * Builds structured infographic data from passage & paper metadata
   */
  extractStructuredSteps(selectedText, paper) {
    const clean = (selectedText || paper.summaryText || "").replace(/\s+/g, " ").trim();
    const sentences = clean
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    const kws = (paper.keywordsList || ["Input", "Mechanism", "Evaluation"]).slice(0, 4);

    const step1 = sentences[0]
      ? sentences[0].slice(0, 88) + (sentences[0].length > 88 ? "..." : "")
      : (paper.threeLineSummary?.[0] || "연구 배경 및 문제 정의").slice(0, 88);

    const step2 = sentences[1]
      ? sentences[1].slice(0, 88) + (sentences[1].length > 88 ? "..." : "")
      : (paper.threeLineSummary?.[1] || "핵심 알고리즘 및 실험 설계").slice(0, 88);

    const step3 = sentences[2]
      ? sentences[2].slice(0, 88) + (sentences[2].length > 88 ? "..." : "")
      : (paper.threeLineSummary?.[2] || "정량적 검증 및 이론 일치 확인").slice(0, 88);

    return {
      paperTitle: (paper.title || "Research Paper").slice(0, 68),
      venueBadge: `${paper.venue || "Academic Research"} (${paper.year || 2026})`,
      keywords: kws,
      stages: [
        {
          num: "01",
          label: "PROBLEM & SETUP",
          titleKo: "연구 배경 · 입력 구성",
          desc: step1,
          color: "#6366f1"
        },
        {
          num: "02",
          label: "CORE METHODOLOGY",
          titleKo: "핵심 메커니즘 · 계측/연산",
          desc: step2,
          color: "#0ea5e9"
        },
        {
          num: "03",
          label: "VERIFIED OUTCOME",
          titleKo: "실험 성과 · 이론 검증",
          desc: step3,
          color: "#10b981"
        }
      ],
      takeaway: (paper.threeLineSummary?.[0] || clean).slice(0, 105)
    };
  }

  wrapSvgText(text, maxChars = 30, maxLines = 3) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let current = "";
    for (const w of words) {
      if ((current + " " + w).trim().length <= maxChars) {
        current = (current + " " + w).trim();
      } else {
        if (current) lines.push(current);
        current = w;
        if (lines.length >= maxLines - 1) break;
      }
    }
    if (current && lines.length < maxLines) {
      lines.push(current.length > maxChars ? current.slice(0, maxChars - 1) + "…" : current);
    }
    return lines;
  }

  escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Generates a crisp 900x520 Academic Infographic SVG string
   */
  generateSVG(selectedText, paper, aiCustomStages = null) {
    const spec = aiCustomStages || this.extractStructuredSteps(selectedText, paper);

    const cardsSvg = spec.stages
      .map((st, idx) => {
        const x = 45 + idx * 278;
        const y = 165;
        const descLines = this.wrapSvgText(st.desc, 26, 4);
        const tspans = descLines
          .map(
            (ln, lIdx) =>
              `<tspan x="${x + 20}" dy="${lIdx === 0 ? 0 : 19}">${this.escapeXml(ln)}</tspan>`
          )
          .join("");

        const arrowSvg =
          idx < 2
            ? `<g transform="translate(${x + 258}, ${y + 98})">
                 <line x1="0" y1="0" x2="16" y2="0" stroke="#64748b" stroke-width="2" stroke-dasharray="3,2"/>
                 <polygon points="14,-5 22,0 14,5" fill="#818cf8"/>
               </g>`
            : "";

        return `
          <g>
            <rect x="${x}" y="${y}" width="254" height="215" rx="16" fill="#161926" stroke="${st.color}" stroke-width="1.6"/>
            <rect x="${x}" y="${y}" width="254" height="6" rx="3" fill="${st.color}"/>
            <rect x="${x + 18}" y="${y + 20}" width="36" height="24" rx="6" fill="${st.color}" fill-opacity="0.2"/>
            <text x="${x + 36}" y="${y + 36}" text-anchor="middle" fill="${st.color}" font-size="12" font-weight="700" font-family="Pretendard, Inter, sans-serif">${st.num}</text>
            <text x="${x + 62}" y="${y + 36}" fill="#94a3b8" font-size="10" font-weight="700" letter-spacing="0.8" font-family="Pretendard, Inter, sans-serif">${this.escapeXml(st.label)}</text>
            <text x="${x + 20}" y="${y + 68}" fill="#f8fafc" font-size="15" font-weight="700" font-family="Pretendard, Inter, sans-serif">${this.escapeXml(st.titleKo)}</text>
            <line x1="${x + 20}" y1="${y + 82}" x2="${x + 234}" y2="${y + 82}" stroke="#272c40" stroke-width="1"/>
            <text x="${x + 20}" y="${y + 108}" fill="#cbd5e1" font-size="12.5" font-family="Pretendard, Inter, sans-serif">${tspans}</text>
          </g>
          ${arrowSvg}
        `;
      })
      .join("");

    const kwPills = (spec.keywords || [])
      .slice(0, 4)
      .map((kw, i) => {
        const kx = 45 + i * 205;
        const label = kw.length > 22 ? kw.slice(0, 21) + "…" : kw;
        return `
          <g>
            <rect x="${kx}" y="112" width="192" height="28" rx="14" fill="#1e2235" stroke="#3730a3" stroke-width="1"/>
            <text x="${kx + 96}" y="130" text-anchor="middle" fill="#a5b4fc" font-size="11.5" font-weight="600" font-family="Pretendard, Inter, sans-serif"># ${this.escapeXml(label)}</text>
          </g>
        `;
      })
      .join("");

    return `<svg id="generated-infographic-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 500" class="w-full h-auto rounded-xl shadow-lg border border-zinc-700/60">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0b0e17"/>
          <stop offset="55%" stop-color="#111629"/>
          <stop offset="100%" stop-color="#191229"/>
        </linearGradient>
        <linearGradient id="accentBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="50%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#10b981"/>
        </linearGradient>
      </defs>

      <rect width="900" height="500" rx="18" fill="url(#bgGrad)"/>
      <rect x="0" y="0" width="900" height="5" fill="url(#accentBar)"/>

      <!-- Header -->
      <text x="45" y="42" fill="#818cf8" font-size="11" font-weight="700" letter-spacing="1.2" font-family="Pretendard, Inter, sans-serif">AI RESEARCH VISUAL INFOGRAPHIC · ${this.escapeXml(spec.venueBadge)}</text>
      <text x="45" y="74" fill="#ffffff" font-size="20" font-weight="800" font-family="Pretendard, Inter, sans-serif">${this.escapeXml(spec.paperTitle)}</text>
      <line x1="45" y1="94" x2="855" y2="94" stroke="#23293e" stroke-width="1"/>

      <!-- Keyword Pills -->
      ${kwPills}

      <!-- 3-Stage Pipeline Cards -->
      ${cardsSvg}

      <!-- Bottom Key Takeaway Banner -->
      <rect x="45" y="405" width="810" height="64" rx="14" fill="#171d30" stroke="#312e81" stroke-width="1.2"/>
      <text x="68" y="430" fill="#a5b4fc" font-size="11" font-weight="700" font-family="Pretendard, Inter, sans-serif">★ KEY RESEARCH TAKEAWAY (핵심 요약 인사이트)</text>
      <text x="68" y="452" fill="#f1f5f9" font-size="12.5" font-family="Pretendard, Inter, sans-serif">${this.escapeXml(spec.takeaway)}</text>
    </svg>`;
  }

  /**
   * Downloads the rendered SVG Infographic as a high-res PNG image
   */
  downloadAsPng(svgElementId, filename = "Research_Infographic.png") {
    const svgEl = document.getElementById(svgElementId);
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      a.click();
    };
    img.src = url;
  }
}

window.infographicEngine = new InfographicGenerator();
