// Custom AI Research Platform — Column-Aware PDF Layout Parser, 1:1 Bounding-Box Extractor & Region Capture Engine

class PdfLayoutAndCaptureEngine {
  constructor() {
    this.isCapturing = false;
    this.startX = 0;
    this.startY = 0;
    this.overlayEl = null;
    this.selectionBoxEl = null;
    this.onCaptureCallback = null;
  }

  /**
   * Multiplies two 2D affine 6-element matrices [a, b, c, d, e, f]
   */
  multiplyTransform(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  /**
   * Joins wrapped academic PDF lines while repairing hyphenated line-breaks (e.g., "Parti-" + "cle" -> "Particle")
   */
  joinAcademicLines(linesArray) {
    if (!linesArray || linesArray.length === 0) return "";
    let out = "";
    for (let i = 0; i < linesArray.length; i++) {
      const curr = (linesArray[i] || "").trim();
      if (!curr) continue;
      if (!out) {
        out = curr;
        continue;
      }
      if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(curr)) {
        out = out.slice(0, -1) + curr;
      } else {
        out += " " + curr;
      }
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /**
   * Reverse-engineers column-aware headings, paragraphs, 1:1 bounding boxes (for Layout Translation),
   * equations, figure captions, and bibliography references from PDF.js pages.
   */
  extractStructuredDocument(fileName, pagesDataList) {
    const allSections = [];
    const extractedFigures = [];
    const extractedEquations = [];
    const extractedCitations = [];
    const pageBlocksByPage = {};
    let detectedTitle = "";
    let maxTitleFont = 0;
    let inReferences = false;
    const rawReferenceLines = [];

    (pagesDataList || []).forEach((pageEntry, pageIdx) => {
      const pageNum = pageIdx + 1;
      const isRichPage = pageEntry && !Array.isArray(pageEntry) && Array.isArray(pageEntry.items);
      const items = isRichPage ? pageEntry.items : Array.isArray(pageEntry) ? pageEntry : [];
      const pageW = isRichPage && pageEntry.width ? pageEntry.width : 795;
      const pageH = isRichPage && pageEntry.height ? pageEntry.height : 1030;
      const scale = isRichPage && pageEntry.scale ? pageEntry.scale : 1.3;
      const vpTransform =
        isRichPage && Array.isArray(pageEntry.viewportTransform)
          ? pageEntry.viewportTransform
          : [scale, 0, 0, -scale, 0, pageH];

      const rowBuckets = [];

      for (const item of items) {
        const rawStr = item.str || "";
        const str = rawStr.trim();
        if (!str) continue;

        const tr = item.transform || [10, 0, 0, 10, 0, 0];
        // Skip rotated vertical margin stamps (e.g., left-side arXiv vertical watermark)
        if (Math.abs(tr[1]) > Math.abs(tr[0]) * 1.15) {
          continue;
        }

        const tx = this.multiplyTransform(vpTransform, tr);
        const leftPx = tx[4];
        const baseY = tx[5];
        const fontPx = Math.max(8, Math.hypot(tx[2], tx[3]) || (item.height ? item.height * scale : 12));
        const widthPx = Math.max(
          fontPx * 0.45,
          item.width ? item.width * scale : rawStr.length * fontPx * 0.48
        );
        const topPx = baseY - fontPx * 0.86;
        const bottomPx = baseY + fontPx * 0.24;
        const rightPx = leftPx + widthPx;

        // Detect main paper title on Page 1
        if (
          pageNum === 1 &&
          topPx < pageH * 0.42 &&
          fontPx > maxTitleFont - 0.4 &&
          str.length > 6 &&
          !/arxiv|http|doi|preprint|copyright/i.test(str)
        ) {
          if (fontPx > maxTitleFont + 0.6) {
            maxTitleFont = fontPx;
            detectedTitle = str;
          } else if (Math.abs(fontPx - maxTitleFont) <= 0.6 && detectedTitle.length < 180) {
            detectedTitle = `${detectedTitle} ${str}`.replace(/\s+/g, " ").trim();
          }
        }

        let matchedRow = rowBuckets.find(
          (r) => Math.abs(r.baseY - baseY) <= Math.max(3.8, Math.min(r.avgFont, fontPx) * 0.45)
        );
        if (!matchedRow) {
          matchedRow = { baseY, avgFont: fontPx, chunks: [] };
          rowBuckets.push(matchedRow);
        }
        matchedRow.chunks.push({
          str,
          leftPx,
          rightPx,
          topPx,
          bottomPx,
          fontPx
        });
        matchedRow.avgFont =
          matchedRow.chunks.reduce((acc, c) => acc + c.fontPx, 0) / matchedRow.chunks.length;
      }

      // Sort rows top-to-bottom in viewport coordinates
      rowBuckets.sort((a, b) => a.baseY - b.baseY);

      // Split each row into column-aware horizontal line segments
      const rawSegments = [];
      for (const row of rowBuckets) {
        row.chunks.sort((a, b) => a.leftPx - b.leftPx);
        let curChunks = [];
        for (const ch of row.chunks) {
          if (curChunks.length === 0) {
            curChunks.push(ch);
            continue;
          }
          const prev = curChunks[curChunks.length - 1];
          const gap = ch.leftPx - prev.rightPx;
          // Split if there is a column gutter gap (> ~25px)
          const splitThreshold = Math.max(24, row.avgFont * 1.85);
          if (gap > splitThreshold) {
            rawSegments.push(this.finalizeSegment(curChunks));
            curChunks = [ch];
          } else {
            curChunks.push(ch);
          }
        }
        if (curChunks.length > 0) {
          rawSegments.push(this.finalizeSegment(curChunks));
        }
      }

      // Filter out standalone page numbers at very top/bottom margins
      const cleanSegments = rawSegments.filter((seg) => {
        if (/^\d{1,3}$/.test(seg.text) && (seg.topPx < pageH * 0.07 || seg.bottomPx > pageH * 0.93)) {
          return false;
        }
        return seg.text.length > 0;
      });

      // Determine body median font size on this page
      const sortedFonts = cleanSegments.map((s) => s.fontPx).sort((a, b) => a - b);
      const bodyFontPx = sortedFonts.length > 0 ? sortedFonts[Math.floor(sortedFonts.length * 0.5)] : 12;

      // Sort segments in column-aware reading order:
      // Bucket into vertical zones separated by full-width spanning segments (like Title / Abstract / Wide Figures)
      const orderedSegments = this.orderSegmentsColumnAware(cleanSegments, pageW);

      // Group ordered segments into contiguous bounding-box blocks for 1:1 Layout Overlay & logical sections
      const mergedBlocks = [];
      for (const seg of orderedSegments) {
        const isHeadingLine =
          (/^(\d+(?:\.\d+)*)\s+[A-Z]/.test(seg.text) && seg.text.length < 85) ||
          (/^(abstract|introduction|conclusion|conclusions|discussion|methods|methodology|results|references|acknowledgments)\b/i.test(
            seg.text
          ) &&
            seg.text.length < 40) ||
          seg.fontPx > bodyFontPx * 1.18;

        const prevBlock = mergedBlocks[mergedBlocks.length - 1];
        const canMerge =
          prevBlock &&
          !prevBlock.isHeading &&
          !isHeadingLine &&
          prevBlock.colTag === seg.colTag &&
          seg.topPx >= prevBlock.bottomPx - prevBlock.fontPx * 0.45 &&
          seg.topPx - prevBlock.bottomPx <= Math.max(prevBlock.fontPx * 1.48, 18) &&
          Math.abs(seg.fontPx - prevBlock.fontPx) <= 2.4 &&
          (Math.abs(seg.leftPx - prevBlock.leftPx) <= 42 ||
            (seg.leftPx >= prevBlock.leftPx - 12 && seg.rightPx <= prevBlock.rightPx + 24));

        if (canMerge) {
          prevBlock.lines.push(seg.text);
          prevBlock.leftPx = Math.min(prevBlock.leftPx, seg.leftPx);
          prevBlock.rightPx = Math.max(prevBlock.rightPx, seg.rightPx);
          prevBlock.topPx = Math.min(prevBlock.topPx, seg.topPx);
          prevBlock.bottomPx = Math.max(prevBlock.bottomPx, seg.bottomPx);
        } else {
          mergedBlocks.push({
            colTag: seg.colTag,
            isHeading: isHeadingLine,
            fontPx: seg.fontPx,
            leftPx: seg.leftPx,
            rightPx: seg.rightPx,
            topPx: seg.topPx,
            bottomPx: seg.bottomPx,
            lines: [seg.text]
          });
        }
      }

      // Build 1:1 Layout Overlay Blocks for this PDF page (excluding tiny 1-3 char axis tick labels inside figures)
      const pageOverlayBlocks = [];
      const pageParagraphs = [];
      let currentSecTitle = `Page ${pageNum}`;
      let currentSecNum = `${pageNum}`;

      mergedBlocks.forEach((blk, bIdx) => {
        const joined = this.joinAcademicLines(blk.lines);
        if (!joined) return;

        // Skip tiny chart tick marks / isolated 1-3 char symbols so figures remain clean
        const hasLetters = /[A-Za-z]{2,}/.test(joined);
        if (!hasLetters || (joined.length < 6 && !blk.isHeading)) {
          return;
        }

        const padX = 2;
        const padY = 1.5;
        const leftPct = Math.max(0, ((blk.leftPx - padX) / pageW) * 100);
        const topPct = Math.max(0, ((blk.topPx - padY) / pageH) * 100);
        const widthPct = Math.min(100 - leftPct, ((blk.rightPx - blk.leftPx + padX * 2) / pageW) * 100);
        const heightPct = Math.min(100 - topPct, ((blk.bottomPx - blk.topPx + padY * 2) / pageH) * 100);

        // Skip pure equation lines from being overwritten by prose translation so mathematical notation stays crisp
        const looksLikePureMath =
          /\(\d+\)\s*$/.test(joined) &&
          joined.length < 95 &&
          /[=+\-*/^_∑∫αβγθλμσΔΩ]/.test(joined) &&
          (joined.match(/[A-Za-z]{4,}/g) || []).length <= 2;

        if (looksLikePureMath) {
          const eqNumMatch = joined.match(/\((\d+)\)\s*$/);
          extractedEquations.push({
            id: `up-eq-${extractedEquations.length + 1}`,
            label: `Eq. (${eqNumMatch ? eqNumMatch[1] : extractedEquations.length + 1})`,
            title: `Page ${pageNum} 추출 수식`,
            latex: joined.replace(/\(\d+\)\s*$/, "").trim(),
            summary: `논문 ${pageNum}페이지 본문에서 감지된 핵심 관계식입니다.`,
            variables: []
          });
          return;
        }

        pageOverlayBlocks.push({
          id: `pdf-blk-${pageNum}-${bIdx + 1}`,
          pageNum,
          leftPct: Number(leftPct.toFixed(2)),
          topPct: Number(topPct.toFixed(2)),
          widthPct: Number(widthPct.toFixed(2)),
          heightPct: Number(heightPct.toFixed(2)),
          fontPx: Number(blk.fontPx.toFixed(1)),
          lineCount: blk.lines.length,
          isHeading: blk.isHeading,
          en: joined,
          ko: "",
          translatedLang: ""
        });

        // Section / Reference / Figure / Paragraph logical classification
        if (/^(references|bibliography|참고문헌)$/i.test(joined.trim())) {
          inReferences = true;
          currentSecTitle = "References";
          return;
        }

        if (inReferences) {
          rawReferenceLines.push(joined);
          return;
        }

        const secMatch = joined.match(/^(\d+(?:\.\d+)*)\s+([A-Z][A-Za-z0-9\s\-:,()]{2,72})$/);
        if (secMatch && joined.length < 85) {
          currentSecNum = secMatch[1];
          currentSecTitle = secMatch[2].trim();
          return;
        }

        const figMatch = joined.match(/^(Figure|Fig\.|Table)\s*(\d+)[:.\s]+(.+)/i);
        if (figMatch) {
          extractedFigures.push({
            id: `up-fig-${extractedFigures.length + 1}`,
            label: `${figMatch[1]} ${figMatch[2]}`,
            type: /table/i.test(figMatch[1]) ? "table" : "diagram",
            title: figMatch[3].slice(0, 95),
            caption: joined,
            aiInsight: `Page ${pageNum} 캡션 추출: ${joined}`,
            headers: ["항목", "추출 위치", "캡션 내용"],
            rows: [[`${figMatch[1]} ${figMatch[2]}`, `Page ${pageNum}`, figMatch[3].slice(0, 110)]]
          });
        }

        if (joined.length >= 18) {
          pageParagraphs.push(joined);
        }
      });

      pageBlocksByPage[pageNum] = pageOverlayBlocks;

      if (pageParagraphs.length > 0) {
        allSections.push({
          id: `up-sec-p${pageNum}`,
          number: currentSecNum,
          title: currentSecTitle,
          titleKo: "",
          page: pageNum,
          paragraphs: pageParagraphs.map((pText, pIdx) => ({
            id: `up-p-${pageNum}-${pIdx + 1}`,
            en: pText,
            ko: "",
            translatedLang: "",
            highlights: []
          }))
        });
      }
    });

    // Parse raw reference lines into [1], [2] or 1., 2. entries
    const joinedRefs = rawReferenceLines.join(" ");
    const refBlocks = joinedRefs.includes("[1]")
      ? joinedRefs.split(/(?=\[\d+\])/g)
      : rawReferenceLines;

    for (const block of refBlocks) {
      const m =
        block.trim().match(/^\[(\d+)\]\s*(.+)/) ||
        block.trim().match(/^(\d+)\.\s+([A-Z].{25,})/);
      if (m && m[2].length > 20) {
        extractedCitations.push({
          num: m[1],
          title: m[2].slice(0, 125),
          authors: "PDF Bibliography Extracted",
          venue: "Referenced Literature",
          year: (m[2].match(/\b(19|20)\d{2}\b/) || [""])[0],
          citations: "실시간 조회 가능",
          role: "본문 참고문헌",
          abstract: m[2],
          relevance: "업로드된 PDF의 References 섹션에서 자동 파싱된 참고문헌입니다."
        });
      }
    }

    return {
      detectedTitle: detectedTitle || fileName.replace(/\.pdf$/i, ""),
      sections: allSections,
      pageBlocksByPage,
      equations: extractedEquations.slice(0, 15),
      figures: extractedFigures,
      citations: extractedCitations.slice(0, 35)
    };
  }

  finalizeSegment(chunks) {
    let text = "";
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (i === 0) {
        text = c.str;
      } else {
        const gap = c.leftPx - chunks[i - 1].rightPx;
        text += (gap > c.fontPx * 0.16 ? " " : "") + c.str;
      }
    }
    const leftPx = Math.min(...chunks.map((c) => c.leftPx));
    const rightPx = Math.max(...chunks.map((c) => c.rightPx));
    const topPx = Math.min(...chunks.map((c) => c.topPx));
    const bottomPx = Math.max(...chunks.map((c) => c.bottomPx));
    const fontPx = chunks.reduce((acc, c) => acc + c.fontPx, 0) / chunks.length;
    return {
      text: text.replace(/\s+/g, " ").trim(),
      leftPx,
      rightPx,
      topPx,
      bottomPx,
      fontPx
    };
  }

  /**
   * Orders segments cleanly for both 1-column and 2-column academic papers
   */
  orderSegmentsColumnAware(segments, pageW) {
    const midX = pageW * 0.5;
    const ordered = [];
    let leftColBuf = [];
    let rightColBuf = [];

    const flushColumns = () => {
      if (leftColBuf.length > 0) {
        leftColBuf.sort((a, b) => a.topPx - b.topPx);
        ordered.push(...leftColBuf);
        leftColBuf = [];
      }
      if (rightColBuf.length > 0) {
        rightColBuf.sort((a, b) => a.topPx - b.topPx);
        ordered.push(...rightColBuf);
        rightColBuf = [];
      }
    };

    for (const seg of segments) {
      const width = seg.rightPx - seg.leftPx;
      const crossesCenter = seg.leftPx < midX - 28 && seg.rightPx > midX + 28;
      const isWide = width > pageW * 0.48 || crossesCenter;

      if (isWide) {
        flushColumns();
        ordered.push({ ...seg, colTag: "full" });
      } else if (seg.rightPx <= midX + 18) {
        leftColBuf.push({ ...seg, colTag: "left" });
      } else if (seg.leftPx >= midX - 18) {
        rightColBuf.push({ ...seg, colTag: "right" });
      } else {
        flushColumns();
        ordered.push({ ...seg, colTag: "full" });
      }
    }
    flushColumns();
    return ordered;
  }

  /**
   * Starts interactive crosshair Bounding-Box Region Capture over #center-viewport
   */
  startRegionCapture(onCaptured) {
    if (this.isCapturing) {
      this.cancelRegionCapture();
      return;
    }
    this.isCapturing = true;
    this.onCaptureCallback = onCaptured;

    const overlay = document.createElement("div");
    overlay.id = "bbox-capture-overlay";
    overlay.className =
      "fixed inset-0 z-50 cursor-crosshair bg-indigo-950/20 backdrop-blur-[0.5px] select-none";

    const banner = document.createElement("div");
    banner.className =
      "fixed top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-xl flex items-center gap-2";
    banner.innerHTML = `
      <span>🎯 수식·그래프·표 영역을 마우스로 드래그하여 선택하세요 (ESC 취소)</span>
      <button id="cancel-bbox-btn" class="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[11px]">취소</button>
    `;
    overlay.appendChild(banner);

    const box = document.createElement("div");
    box.className =
      "hidden fixed border-2 border-indigo-400 bg-indigo-500/15 rounded shadow-lg pointer-events-none";
    overlay.appendChild(box);

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.selectionBoxEl = box;

    document.getElementById("cancel-bbox-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cancelRegionCapture();
    });

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        window.removeEventListener("keydown", onKeyDown);
        this.cancelRegionCapture();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    let dragging = false;
    overlay.addEventListener("mousedown", (e) => {
      if (e.target.id === "cancel-bbox-btn") return;
      dragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      box.style.left = `${this.startX}px`;
      box.style.top = `${this.startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.classList.remove("hidden");
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.min(this.startX, e.clientX);
      const y = Math.min(this.startY, e.clientY);
      const w = Math.abs(e.clientX - this.startX);
      const h = Math.abs(e.clientY - this.startY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    });

    overlay.addEventListener("mouseup", (e) => {
      if (!dragging) return;
      dragging = false;
      const rect = {
        left: Math.min(this.startX, e.clientX),
        top: Math.min(this.startY, e.clientY),
        width: Math.abs(e.clientX - this.startX),
        height: Math.abs(e.clientY - this.startY)
      };
      window.removeEventListener("keydown", onKeyDown);
      this.finishRegionCapture(rect);
    });
  }

  cancelRegionCapture() {
    this.isCapturing = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  finishRegionCapture(rect) {
    this.cancelRegionCapture();
    if (rect.width < 20 || rect.height < 16) return;

    // 1. Check if user dragged over an uploaded PDF <canvas>
    let croppedDataUrl = null;
    const canvases = document.querySelectorAll("#pdfjs-pages-wrapper canvas");
    for (const c of canvases) {
      const cRect = c.getBoundingClientRect();
      const interLeft = Math.max(rect.left, cRect.left);
      const interTop = Math.max(rect.top, cRect.top);
      const interRight = Math.min(rect.left + rect.width, cRect.right);
      const interBottom = Math.min(rect.top + rect.height, cRect.bottom);

      if (interRight > interLeft + 10 && interBottom > interTop + 10) {
        const scaleX = c.width / cRect.width;
        const scaleY = c.height / cRect.height;
        const sx = (interLeft - cRect.left) * scaleX;
        const sy = (interTop - cRect.top) * scaleY;
        const sw = (interRight - interLeft) * scaleX;
        const sh = (interBottom - interTop) * scaleY;

        const outCanvas = document.createElement("canvas");
        outCanvas.width = Math.max(1, Math.round(sw));
        outCanvas.height = Math.max(1, Math.round(sh));
        const outCtx = outCanvas.getContext("2d");
        outCtx.drawImage(c, sx, sy, sw, sh, 0, 0, outCanvas.width, outCanvas.height);
        croppedDataUrl = outCanvas.toDataURL("image/png");
        break;
      }
    }

    // 2. Collect underlying DOM text / equations / tables intersecting the bounding box
    const intersectedTexts = [];
    const targetElements = document.querySelectorAll(
      "#paper-sheet p, #paper-sheet h1, #paper-sheet h2, #paper-sheet table, #paper-sheet .katex, .pdf-text-layer span, .pdf-layout-trans-block"
    );
    targetElements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        r.right >= rect.left &&
        r.left <= rect.left + rect.width &&
        r.bottom >= rect.top &&
        r.top <= rect.top + rect.height
      ) {
        const origText = el.getAttribute("data-orig-en") || el.innerText || el.textContent || "";
        const txt = origText.trim();
        if (txt && !intersectedTexts.includes(txt)) {
          intersectedTexts.push(txt);
        }
      }
    });

    const capturedText = intersectedTexts.join(" ").slice(0, 900);

    if (!croppedDataUrl) {
      croppedDataUrl = this.renderSyntheticCropPreview(capturedText, rect);
    }

    if (typeof this.onCaptureCallback === "function") {
      this.onCaptureCallback({
        rect,
        imageDataUrl: croppedDataUrl,
        extractedText: capturedText
      });
    }
  }

  renderSyntheticCropPreview(capturedText, rect) {
    const canvas = document.createElement("canvas");
    canvas.width = 680;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#181822";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.fillStyle = "#818cf8";
    ctx.font = "bold 13px Pretendard, sans-serif";
    ctx.fillText(
      `CAPTURED REGION (${Math.round(rect.width)} × ${Math.round(rect.height)} px)`,
      22,
      32
    );

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "15px Georgia, serif";
    const text = capturedText || "선택된 논문 수식 / 도표 영역";
    const maxChars = 68;
    for (let i = 0; i < 4; i++) {
      const line = text.slice(i * maxChars, (i + 1) * maxChars);
      if (!line) break;
      ctx.fillText(line + (i === 3 && text.length > maxChars * 4 ? "..." : ""), 22, 68 + i * 28);
    }
    return canvas.toDataURL("image/png");
  }
}

window.pdfEngine = new PdfLayoutAndCaptureEngine();
