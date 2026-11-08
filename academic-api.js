// Custom AI Research Platform — Live Scholarly Discovery, Smart Citation & Recommendation Engine
// Powered by OpenAlex Public API (CORS-enabled, 250M+ Academic Works)

class AcademicScholarAPI {
  constructor() {
    this.baseUrl = "https://api.openalex.org/works";
  }

  /**
   * Reconstructs OpenAlex's abstract_inverted_index into plain readable text
   */
  reconstructAbstract(invertedIndex) {
    if (!invertedIndex || typeof invertedIndex !== "object") return "";
    const wordsByPos = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      if (Array.isArray(positions)) {
        for (const pos of positions) {
          wordsByPos[pos] = word;
        }
      }
    }
    return wordsByPos.filter(Boolean).join(" ");
  }

  /**
   * Normalizes an OpenAlex Work object into our internal paper/citation card format
   */
  normalizeWork(work, queryKeywords = []) {
    const abstractText =
      this.reconstructAbstract(work.abstract_inverted_index) ||
      "초록 메타데이터가 공개되지 않은 문헌입니다. 원문 링크 또는 DOI를 통해 상세 내용을 확인할 수 있습니다.";
    const authors = (work.authorships || [])
      .slice(0, 5)
      .map((a) => a.author?.display_name)
      .filter(Boolean);
    if ((work.authorships || []).length > 5) authors.push("et al.");

    const venue =
      work.primary_location?.source?.display_name ||
      work.host_venue?.display_name ||
      "Academic Preprint / Journal";
    const pdfUrl =
      work.open_access?.oa_url ||
      work.primary_location?.pdf_url ||
      null;
    const landingUrl =
      work.primary_location?.landing_page_url ||
      work.doi ||
      work.id;

    // Compute similarity score against current library/paper keywords
    const titleLower = (work.display_name || "").toLowerCase();
    const absLower = abstractText.toLowerCase();
    let hits = 0;
    for (const kw of queryKeywords) {
      const k = kw.toLowerCase();
      if (titleLower.includes(k) || absLower.includes(k)) hits++;
    }
    const baseMatch = queryKeywords.length > 0
      ? Math.min(96, Math.max(72, Math.round(70 + (hits / queryKeywords.length) * 26)))
      : 85;

    const concepts = (work.concepts || [])
      .slice(0, 5)
      .map((c) => c.display_name)
      .filter(Boolean);

    return {
      id: `oa-${(work.id || "").split("/").pop() || Date.now()}`,
      title: work.display_name || "Untitled Research Paper",
      authors: authors.length > 0 ? authors : ["Unknown Authors"],
      authorsStr: (authors.length > 0 ? authors : ["Unknown Authors"]).join(", "),
      year: work.publication_year || new Date().getFullYear(),
      venue,
      citationCount: (work.cited_by_count || 0).toLocaleString(),
      abstract: abstractText,
      pdfUrl,
      landingUrl,
      doi: work.doi || "",
      matchRate: `${baseMatch}%`,
      recommendLabel: work.cited_by_count > 500 ? "피인용 우수 논문" : "최신 관련 연구",
      keywords: concepts.length > 0 ? concepts : ["Research", "Academic Paper"]
    };
  }

  /**
   * Search live global research papers by keyword, title, or DOI/arXiv query
   */
  async searchPapers(query, perPage = 8) {
    const q = (query || "").trim();
    if (!q) return [];
    const url = `${this.baseUrl}?search=${encodeURIComponent(q)}&per-page=${perPage}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`학술 검색 API 오류 (${res.status})`);
    const data = await res.json();
    const tokens = q.split(/\s+/).filter((w) => w.length > 2);
    return (data.results || []).map((w) => this.normalizeWork(w, tokens));
  }

  /**
   * Recommend related papers dynamically based on the active paper's title & keywords
   */
  async fetchRelatedRecommendations(paper, limit = 5) {
    try {
      const keywords = (paper.keywordsList || []).slice(0, 3);
      const searchTerms = keywords.length > 0 ? keywords.join(" ") : paper.title.split(/\s+/).slice(0, 5).join(" ");
      const results = await this.searchPapers(searchTerms, limit + 2);
      const filtered = results.filter(
        (r) => r.title.toLowerCase() !== paper.title.toLowerCase()
      );
      if (filtered.length > 0) return filtered.slice(0, limit);
    } catch (err) {
      console.warn("Live recommendation fallback to curated list:", err);
    }
    return window.MOONLIGHT_RELATED_PAPERS || [];
  }

  /**
   * Resolve a raw reference string from an uploaded PDF's Bibliography into a rich Smart Citation Card
   */
  async resolveReferenceCitation(rawRefString, refNum = "1") {
    try {
      const cleaned = rawRefString
        .replace(/^\[\d+\]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .slice(0, 140);
      const hits = await this.searchPapers(cleaned, 1);
      if (hits.length > 0) {
        const top = hits[0];
        return {
          num: String(refNum),
          title: top.title,
          authors: top.authorsStr,
          venue: top.venue,
          year: top.year,
          citations: `${top.citationCount}+`,
          role: "실시간 학술 DB 매칭 문헌",
          abstract: top.abstract,
          relevance: "OpenAlex 글로벌 학술 그래프에서 실시간 조회된 참고문헌 메타데이터입니다.",
          landingUrl: top.landingUrl,
          pdfUrl: top.pdfUrl
        };
      }
    } catch (err) {
      console.warn("Smart citation live lookup fallback:", err);
    }
    return {
      num: String(refNum),
      title: rawRefString.slice(0, 110) + (rawRefString.length > 110 ? "..." : ""),
      authors: "본문 참고문헌 추출 항목",
      venue: "Bibliography Reference",
      year: "",
      citations: "-",
      role: "참고문헌",
      abstract: rawRefString,
      relevance: "현재 논문의 References 섹션에서 추출된 인용 문헌입니다."
    };
  }

  /**
   * Converts a discovered OpenAlex paper directly into a full interactive workspace paper object
   */
  convertWorkToWorkspacePaper(workItem) {
    const sentences = (workItem.abstract || "")
      .split(/(?<=[.?!])\s+/)
      .filter((s) => s.length > 25);

    const highlights = sentences.slice(0, 3).map((s, idx) => ({
      id: `oa-hl-${Date.now()}-${idx}`,
      category: idx === 0 ? "novelty" : idx === 1 ? "methodology" : "result",
      categoryLabel: idx === 0 ? "핵심 연구 배경/목적" : idx === 1 ? "제안 방법론" : "주요 연구 결론",
      phrase: s.trim(),
      aiNote: `학술 탐색 엔진이 초록에서 자동 식별한 핵심 문장 #${idx + 1}입니다.`
    }));

    return {
      id: workItem.id,
      title: workItem.title,
      titleKo: `${workItem.title} (실시간 탐색 논문)`,
      shortTitle: workItem.title.slice(0, 26) + (workItem.title.length > 26 ? "..." : ""),
      timeAgo: "방금 탐색됨",
      folder: "실시간 탐색 논문",
      authors: workItem.authors,
      affiliationsLines: [
        `${workItem.venue} (${workItem.year})`,
        workItem.doi ? `DOI: ${workItem.doi}` : "OpenAlex Indexed Work"
      ],
      venue: workItem.venue,
      year: workItem.year,
      arxivStamp: `${workItem.venue} · Cited by ${workItem.citationCount} · ${workItem.year}`,
      arxivId: workItem.doi ? workItem.doi.replace("https://doi.org/", "DOI:") : workItem.id,
      pdfUrl: workItem.pdfUrl,
      landingUrl: workItem.landingUrl,
      totalPages: 1,
      savedInLibrary: false,
      abstractEn: workItem.abstract,
      abstractKo: "",
      keywordsList: workItem.keywords,
      keywordDictionary: workItem.keywords.map((kw) => ({
        term: kw,
        termKo: `${kw} (핵심 학술 개념)`,
        definition: `본 논문(《${workItem.title}》)의 핵심 연구 도메인 및 기술 키워드로 분류된 학술 개념입니다.`,
        importance: `피인용 ${workItem.citationCount}회 문헌의 주요 주제어`
      })),
      threeLineSummary: [
        `📌 연구 주제: ${sentences[0] || workItem.title}`,
        `🔬 핵심 접근: ${sentences[1] || `${workItem.keywords.join(", ")} 기반의 분석 및 실험적 검증을 수행합니다.`}`,
        `✅ 학술적 영향력: ${workItem.venue} (${workItem.year})에 발표되어 현재 ${workItem.citationCount}회 인용되었습니다.`
      ],
      summaryText: `**《${workItem.title}》** (${workItem.authorsStr}, ${workItem.year})은 **${workItem.venue}**에 게재된 연구로, 핵심 키워드는 **${workItem.keywords.join(", ")}**입니다. ${workItem.pdfUrl ? "오픈액세스 원문 PDF 링크가 감지되어 원문 로드가 가능합니다." : ""}`,
      suggestedQuestions: [
        "이 논문의 핵심이 뭐야?",
        "기존 연구랑 뭐가 달라?",
        "한계점이 뭐야?"
      ],
      sections: [
        {
          id: `oa-sec-${Date.now()}`,
          number: "1",
          title: "Overview & Extracted Abstract Analysis",
          titleKo: "1. 논문 개요 및 초록 정밀 분석",
          page: 1,
          paragraphs: [
            {
              id: `oa-p-${Date.now()}`,
              en: workItem.abstract,
              ko: "",
              translatedLang: "",
              highlights
            }
          ]
        }
      ],
      equations: [],
      figures: [],
      citations: []
    };
  }
}

window.scholarAPI = new AcademicScholarAPI();
