// Custom AI Research Platform — Clean First-Time User Workspace & Interactive Controller

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

class MoonlightApp {
  constructor() {
    this.papers = [...(window.MOONLIGHT_PAPERS || [])];
    this.relatedPapers = [...(window.MOONLIGHT_RELATED_PAPERS || [])];
    this.currentPaper = null;

    // Sidebar & Layout states
    this.leftSidebarExpanded = true;
    this.leftMaterialTab = "recent"; // 'recent' | 'folder'
    this.rightPanelVisible = true;

    // Viewer states
    this.zoomLevel = 100;
    this.currentPage = 0;
    this.autoHighlightsEnabled = false;
    this.layoutTranslationEnabled = false;
    this.pageTranslationEnabled = false;
    this.translationInProgress = false;
    this.showingRawPdfCanvas = false;
    this.renderedPdfPaperId = null;

    // Settings Modal states
    this.activeSettingsTab = "general";
    this.activeExplainScope = "all"; // 'all' | 'formula' | 'figure' | 'paragraph' | 'sentence'
    this.promptDraft = null;

    // Right panel expand/collapse states
    this.expandKeywordsAll = false;
    this.expandThreeLineAll = false;
    this.expandSummaryAll = false;
    this.activeKeywordTerm = null;

    this.accordionOpen = {
      keywords: true,
      threeline: true,
      summary: true,
      discussion: true
    };

    // Discussion & Chat states
    this.currentThreadId = "default";
    this.discussionsByPaper = {};
    this.currentSelectionText = "";
    this.attachedContextQuote = null;
    this.attachedExtraPapers = [];
    this.lastFloatingResult = null;

    // Reference Paper Popover & AI Model Selector states
    this.refPaperActiveTab = "all"; // 'all' | 'folder'
    this.refPaperSearchKeyword = "";
    this.libraryActiveTab = "recent"; // 'recent' | 'search' | 'library' | 'trash'
    this.libraryLayoutMode = "list"; // 'list' | 'grid'
    this.librarySortMode = "recent"; // 'recent' | 'title' | 'rating'
    this.libraryFolders = JSON.parse(localStorage.getItem("moonlight_library_folders") || "[]");
    this.paperRatings = JSON.parse(localStorage.getItem("moonlight_paper_ratings") || "{}");

    // Live Explore & Activity states
    this.lastDiscoveredWorks = [];
    this.activityFilter = "all";
    this.proxyServerAvailable = false;

    // User custom multi-color highlights & inline comments
    this.notesStorageKey = "research_studio_user_notes_clean_v1";
    this.userNotesByPaper = JSON.parse(localStorage.getItem(this.notesStorageKey) || "{}");

    // Toolbar Hover Flyout states (오토 하이라이트 · 이미지 설명 · 레이아웃 유지 번역)
    this.toolbarFlyoutTimer = null;
    this.activeToolbarFlyout = null;
    this.currentAutoHighlightPreset = "basic";

    this.init();
  }

  async init() {
    this.applySavedAppSettingsOnBoot();
    this.applyBrandConfigUI();
    this.syncThemeSwitchUI();
    this.setupSelectionListener();
    this.setupAutoOpenPdfInterceptors();
    this.setupZoomInteractions();
    this.setupPageScrollObserver();
    this.updateModelPillUI();

    await this.checkLocalProxyServer();

    await this.loadPersistedUploadedPapers();

    this.renderLeftMaterialsList();
    this.updateSidebarRelatedCardUI();

    // Check if URL query/hash requests opening a PDF directly (e.g., ?pdf=https://arxiv.org/pdf/...)
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const directPdfParam = params.get("pdf") || params.get("url") || hashParams.get("pdf");
    if (directPdfParam) {
      await this.loadRemotePdfUrl(directPdfParam, directPdfParam);
      this.refreshIcons();
      return;
    }

    const targetPaperId = params.get("paper");
    if (targetPaperId) {
      const p = this.papers.find((item) => item.id === targetPaperId);
      if (p) {
        await this.openPaper(p.id);
        this.refreshIcons();
        return;
      }
    }

    if (this.papers.length > 0) {
      await this.openPaper(this.papers[0].id);
    } else {
      this.showOnboardingHome();
    }
    this.refreshIcons();
  }

  applySavedAppSettingsOnBoot() {
    if (!window.researchDB) return;
    const s = window.researchDB.getAppSettings();
    if (typeof s.lightMode === "boolean") {
      document.documentElement.classList.toggle("dark", !s.lightMode);
    }
    document.documentElement.lang = s.language || "ko";
    if (window.moonlightAI && s.aiModel) {
      window.moonlightAI.model = s.aiModel;
    }
    this.applyFontSizesUI();
  }

  applyFontSizesUI() {
    const s = window.researchDB ? window.researchDB.getAppSettings() : {
      fontSizePx: 16,
      separatePageTransFontSize: true,
      pageTransFontSizePx: 16
    };
    const mainPx = Math.min(24, Math.max(12, Number(s.fontSizePx) || 16));
    const pageTransPx = s.separatePageTransFontSize
      ? Math.min(24, Math.max(12, Number(s.pageTransFontSizePx) || 16))
      : mainPx;

    document.documentElement.style.setProperty("--reader-font-size", `${mainPx}px`);
    document.documentElement.style.setProperty("--page-trans-font-size", `${pageTransPx}px`);

    const inlineSlider = document.getElementById("page-trans-inline-slider");
    const inlineVal = document.getElementById("page-trans-inline-val");
    if (inlineSlider) inlineSlider.value = String(pageTransPx);
    if (inlineVal) inlineVal.textContent = `${pageTransPx}px`;

    this.updatePageTransFontBarVisibility();
    if (this.currentPaper && !this.showingRawPdfCanvas) {
      this.renderCurrentPaper();
    }
  }

  updatePageTransFontBarVisibility() {
    const bar = document.getElementById("page-trans-fontsize-bar");
    if (!bar) return;
    const s = window.researchDB ? window.researchDB.getAppSettings() : { separatePageTransFontSize: true };
    if (this.currentPaper && this.pageTranslationEnabled && s.separatePageTransFontSize) {
      bar.classList.remove("hidden");
    } else {
      bar.classList.add("hidden");
    }
  }

  /**
   * Implements "PDF를 문라이트로 자동 열기" (기본 설정):
   * - Intercepts clicks on any .pdf / arXiv PDF links when enabled (respecting '지금 읽는 동안만' vs '앞으로 계속')
   * - Intercepts pasting a PDF/arXiv URL onto the workspace to open directly in Moonlight
   */
  setupAutoOpenPdfInterceptors() {
    // Global listener to close Paper Info Popover & Export Options Popover & Toolbar Hover Flyouts when clicking outside
    document.addEventListener("click", (e) => {
      const infoPopover = document.getElementById("paper-info-popover");
      const infoBtn = document.getElementById("toolbar-btn-info");
      if (infoPopover && !infoPopover.classList.contains("hidden")) {
        if (!infoPopover.contains(e.target) && !infoBtn?.contains(e.target)) {
          this.closePaperInfoPopover();
        }
      }

      const exportPopover = document.getElementById("export-options-popover");
      const exportBtn = document.getElementById("toolbar-btn-export");
      if (exportPopover && !exportPopover.classList.contains("hidden")) {
        if (!exportPopover.contains(e.target) && !exportBtn?.contains(e.target)) {
          this.closeExportPopover();
        }
      }

      // Close Reference Paper Popover when clicking outside
      const refPopover = document.getElementById("popover-ref-paper");
      const refBtn = document.getElementById("chat-ref-paper-btn");
      if (refPopover && !refPopover.classList.contains("hidden")) {
        if (!refPopover.contains(e.target) && !refBtn?.contains(e.target)) {
          this.closeRefPaperPopover();
        }
      }

      // Close AI Model Selector Popover when clicking outside
      const modelPopover = document.getElementById("popover-chat-model");
      const modelBtn = document.getElementById("chat-model-pill");
      if (modelPopover && !modelPopover.classList.contains("hidden")) {
        if (!modelPopover.contains(e.target) && !modelBtn?.contains(e.target)) {
          this.closeChatModelPopover();
        }
      }

      // Close Toolbar Hover Flyouts when clicking outside
      const activeFlyout = document.querySelector(".toolbar-hover-flyout:not(.hidden)");
      if (activeFlyout) {
        const isFlyoutClick = activeFlyout.contains(e.target);
        const isBtnClick = e.target?.closest?.("#toolbar-btn-autohl, #toolbar-btn-imagespec, #toolbar-btn-layout-trans");
        if (!isFlyoutClick && !isBtnClick) {
          this.closeAllToolbarFlyouts();
        }
      }
    });

    // Close File Info Modal & Toolbar Hover Flyouts & Popovers & Full Library Window on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeFileInfoModal();
        this.closeAllToolbarFlyouts();
        this.closeRefPaperPopover();
        this.closeChatModelPopover();
        this.closeFullLibraryView();
      }
    });

    // Ctrl + Drag shortcut for direct Image Explanation / Bounding Box Region Capture
    document.addEventListener("mousedown", (e) => {
      if (e.ctrlKey && e.button === 0) {
        const vp = document.getElementById("center-viewport");
        if (vp && vp.contains(e.target)) {
          if (!window.pdfEngine?.isCapturing) {
            this.activateRegionCapture();
          }
        }
      }
    });

    document.addEventListener("click", (e) => {
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor) return;
      const href = (anchor.getAttribute("href") || "").trim();
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;

      const isPdfTarget =
        /\.pdf($|[?#])/i.test(href) ||
        /arxiv\.org\/(pdf|abs)\//i.test(href);
      if (!isPdfTarget) return;

      const settings = window.researchDB?.getAppSettings();
      if (settings?.autoOpenPdf) {
        e.preventDefault();
        e.stopPropagation();
        this.closeUniversalModal();
        this.loadRemotePdfUrl(href, anchor.textContent?.trim() || href);
      }
    });

    document.addEventListener("paste", (e) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      const settings = window.researchDB?.getAppSettings();
      if (!settings?.autoOpenPdf) return;

      const pasted = (e.clipboardData?.getData("text") || "").trim();
      if (
        /^https?:\/\/\S+\.pdf($|[?#])/i.test(pasted) ||
        /^https?:\/\/arxiv\.org\/(pdf|abs)\/\S+/i.test(pasted)
      ) {
        e.preventDefault();
        this.loadRemotePdfUrl(pasted, pasted);
      }
    });
  }

  setupZoomInteractions() {
    const centerVp = document.getElementById("center-viewport");
    if (centerVp) {
      centerVp.addEventListener("wheel", (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          this.adjustZoom(e.deltaY < 0 ? 10 : -10);
        }
      }, { passive: false });
    }

    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        this.adjustZoom(10);
      } else if (e.ctrlKey && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        this.adjustZoom(-10);
      } else if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        this.handleZoomSelect(100);
      }
    });
  }

  refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  requireActivePaper(actionLabel = "이 기능") {
    if (this.currentPaper) return true;
    this.showFloatingCard(
      "📄 열람 중인 논문이 없습니다",
      `<div class="space-y-2.5 text-xs">
         <p><strong>${this.escapeHtml(actionLabel)}</strong>을(를) 사용하려면 먼저 읽을 논문을 열어주세요.</p>
         <div class="flex items-center gap-2 pt-1">
           <button onclick="document.getElementById('pdf-upload-input').click(); app.closeFloatingCard();"
                   class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition">
             PDF 파일 업로드
           </button>
           <button onclick="app.closeFloatingCard(); app.openExploreModal('');"
                   class="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 font-semibold transition">
             실시간 논문 검색
           </button>
         </div>
       </div>`
    );
    return false;
  }

  async checkLocalProxyServer() {
    if (window.location.protocol === "file:") {
      this.proxyServerAvailable = false;
      return false;
    }
    try {
      const res = await fetch("/api/health", { method: "GET" });
      if (res.ok) {
        this.proxyServerAvailable = true;
        return true;
      }
    } catch (_) {}
    this.proxyServerAvailable = false;
    return false;
  }

  async loadPersistedUploadedPapers() {
    if (!window.researchDB) return;
    try {
      const storedItems = await window.researchDB.getAllUploadedPapers();
      for (const item of storedItems.reverse()) {
        if (item.meta && !this.papers.some((p) => p.id === item.meta.id)) {
          item.meta.timeAgo = "보관됨";
          this.papers.unshift(item.meta);
        }
      }
    } catch (err) {
      console.warn("IndexedDB load skipped:", err);
    }
  }

  // ================= ONBOARDING HOME & DRAG-AND-DROP PDF =================
  showOnboardingHome() {
    this.currentPaper = null;
    this.showingRawPdfCanvas = false;
    this.activeKeywordTerm = null;

    const cfg = window.researchDB?.getBrandConfig() || {};
    document.title = `${cfg.appName || "Research Studio"} — ${cfg.subLabel || "AI Paper Reader"}`;

    document.getElementById("empty-workspace-onboarding")?.classList.remove("hidden");
    document.getElementById("paper-sheet")?.classList.add("hidden");
    document.getElementById("pdfjs-pages-wrapper")?.classList.add("hidden");
    document.getElementById("library-prompt-toast")?.classList.add("hidden");
    document.getElementById("page-translate-widget")?.classList.add("hidden");
    document.getElementById("page-trans-fontsize-bar")?.classList.add("hidden");
    document.getElementById("original-pdf-pill")?.classList.add("hidden");

    const pageInput = document.getElementById("page-num-input");
    const totalPagesEl = document.getElementById("total-pages-label");
    if (pageInput) pageInput.value = "0";
    if (totalPagesEl) totalPagesEl.textContent = "0";

    const starLabel = document.getElementById("expanded-star-label");
    if (starLabel) starLabel.textContent = "라이브러리에 저장";

    this.renderLeftMaterialsList();
    this.updateSidebarRelatedCardUI();
    this.renderRightPanelAll();
    this.closeFloatingCard();
    this.refreshIcons();
  }

  handleDragOver(event) {
    event.preventDefault();
    const dropzone = document.getElementById("onboarding-dropzone");
    dropzone?.classList.add("border-indigo-500", "bg-indigo-500/5");
  }

  handleDragLeave(event) {
    event.preventDefault();
    const dropzone = document.getElementById("onboarding-dropzone");
    dropzone?.classList.remove("border-indigo-500", "bg-indigo-500/5");
  }

  async handleDropPdf(event) {
    event.preventDefault();
    this.handleDragLeave(event);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      this.showFloatingCard("⚠️ 파일 형식 안내", "<p>PDF 문서 파일(.pdf)만 업로드할 수 있습니다.</p>");
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      await this.processPdfArrayBuffer(file.name, arrayBuffer, true);
    } catch (err) {
      this.showFloatingCard("⚠️ PDF 로드 오류", `<p>${this.escapeHtml(err.message)}</p>`);
    }
  }

  handleQuickOnboardingSearch(event) {
    event.preventDefault();
    const q = document.getElementById("onboarding-search-input")?.value.trim() || "";
    this.openExploreModal(q);
  }

  async handleQuickOnboardingUrl(event) {
    event.preventDefault();
    const url = document.getElementById("onboarding-url-input")?.value.trim() || "";
    if (!url) {
      this.openUrlLoadPrompt();
      return;
    }
    await this.loadRemotePdfUrl(url, url);
  }

  // ================= WHITE-LABEL BRAND CUSTOMIZATION & FACTORY RESET =================
  applyBrandConfigUI() {
    if (!window.researchDB) return;
    const cfg = window.researchDB.getBrandConfig();
    const appName = cfg.appName || "Research Studio";
    const rawUser = (cfg.userName || "Guest").trim();

    // 1. Service Name (App Name) in Sidebars and Library Window
    const nameEl = document.getElementById("brand-name-display");
    const subEl = document.getElementById("brand-sub-display");
    const libTitleEl = document.getElementById("library-brand-title");

    if (nameEl) nameEl.textContent = appName;
    if (subEl) subEl.textContent = cfg.subLabel || "AI Paper Reader";
    if (libTitleEl) libTitleEl.textContent = appName;

    // 2. User Nickname Formatting (Nickname in avatars)
    let avatarText = rawUser;
    if (rawUser.length > 4) {
      if (/^[가-힣]+$/.test(rawUser)) {
        avatarText = rawUser.slice(-2);
      } else {
        const parts = rawUser.split(/\s+/);
        avatarText = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : (rawUser === 'Guest' ? 'Guest' : rawUser.slice(0, 2).toUpperCase());
      }
    }

    const railAvatarEl = document.getElementById("user-avatar-badge");
    const planEl = document.getElementById("user-plan-badge");
    const libAvatarTextEl = document.getElementById("library-user-avatar-text");
    const libAvatarBtn = document.getElementById("library-user-avatar");

    if (railAvatarEl) railAvatarEl.textContent = avatarText;
    if (planEl) planEl.textContent = cfg.planBadge || "Workspace";
    if (libAvatarTextEl) libAvatarTextEl.textContent = avatarText;
    if (libAvatarBtn) libAvatarBtn.title = `내 프로필 (${rawUser})`;

    // 3. Theme Specifications (Indigo, Emerald, Sky, Rose)
    const themeSpecs = {
      indigo: {
        primary: "#5850ec",
        primaryHover: "#4f46e5",
        primaryLight: "rgba(88, 80, 236, 0.12)",
        logoGrad: "from-indigo-600 via-purple-600 to-pink-500",
        fullGrad: "from-purple-900 via-indigo-700 to-pink-500",
        nebulaGrad: "from-purple-800 via-indigo-700 to-pink-500",
        avatarBg: "#0d9488",
        cssGradient: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)"
      },
      emerald: {
        primary: "#059669",
        primaryHover: "#047857",
        primaryLight: "rgba(5, 150, 105, 0.12)",
        logoGrad: "from-emerald-500 via-teal-500 to-cyan-500",
        fullGrad: "from-teal-900 via-emerald-700 to-cyan-500",
        nebulaGrad: "from-teal-800 via-emerald-700 to-cyan-500",
        avatarBg: "#059669",
        cssGradient: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #06b6d4 100%)"
      },
      sky: {
        primary: "#0284c7",
        primaryHover: "#0369a1",
        primaryLight: "rgba(2, 132, 199, 0.12)",
        logoGrad: "from-sky-500 via-blue-600 to-indigo-600",
        fullGrad: "from-blue-900 via-sky-700 to-indigo-500",
        nebulaGrad: "from-blue-800 via-sky-700 to-indigo-500",
        avatarBg: "#0284c7",
        cssGradient: "linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)"
      },
      rose: {
        primary: "#e11d48",
        primaryHover: "#be123c",
        primaryLight: "rgba(225, 29, 72, 0.12)",
        logoGrad: "from-rose-500 via-pink-600 to-amber-500",
        fullGrad: "from-rose-900 via-pink-700 to-amber-500",
        nebulaGrad: "from-rose-800 via-pink-700 to-amber-500",
        avatarBg: "#e11d48",
        cssGradient: "linear-gradient(135deg, #e11d48 0%, #db2777 50%, #f59e0b 100%)"
      }
    };

    const preset = cfg.themePreset || "indigo";
    const theme = themeSpecs[preset] || themeSpecs.indigo;

    // 4. Update Brand Logos & Floating Buttons across UI
    const expLogo = document.getElementById("expanded-brand-logo");
    const colLogo = document.getElementById("collapsed-brand-logo");
    const libLogo = document.getElementById("library-brand-logo");
    const nebulaBtn = document.getElementById("library-nebula-btn");

    if (expLogo) {
      expLogo.className = `w-7 h-7 rounded-xl bg-gradient-to-br ${theme.logoGrad} flex items-center justify-center shadow-sm group-hover:scale-105 transition`;
    }
    if (colLogo) {
      colLogo.className = `w-8 h-8 rounded-xl bg-gradient-to-br ${theme.logoGrad} flex items-center justify-center shadow-md hover:scale-105 transition`;
    }
    if (libLogo) {
      libLogo.className = `w-7 h-7 rounded-full bg-gradient-to-tr ${theme.fullGrad} shadow-sm flex items-center justify-center transition`;
    }
    if (nebulaBtn) {
      nebulaBtn.className = `w-11 h-11 rounded-full shadow-xl bg-gradient-to-tr ${theme.fullGrad} flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition`;
    }
    if (libAvatarBtn) {
      libAvatarBtn.style.backgroundColor = theme.avatarBg;
    }

    // 5. Inject Dynamic Brand Theme CSS Rules into DOM
    let styleEl = document.getElementById("dynamic-brand-theme");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "dynamic-brand-theme";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      :root {
        --brand-primary: ${theme.primary} !important;
        --brand-primary-hover: ${theme.primaryHover} !important;
        --brand-primary-light: ${theme.primaryLight} !important;
        --brand-gradient: ${theme.cssGradient} !important;
      }
      .bg-\[\#5850ec\] { background-color: ${theme.primary} !important; }
      .hover\:bg-\[\#5850ec\]:hover { background-color: ${theme.primary} !important; }
      .hover\:bg-indigo-500:hover { background-color: ${theme.primaryHover} !important; }
      .border-\[\#5850ec\] { border-color: ${theme.primary} !important; }
      .text-\[\#5850ec\] { color: ${theme.primary} !important; }
      .focus\:border-\[\#5850ec\]:focus { border-color: ${theme.primary} !important; }
      .focus\:border-indigo-500:focus { border-color: ${theme.primary} !important; }
      .bg-indigo-600 { background-color: ${theme.primary} !important; }
      .hover\:bg-indigo-600:hover { background-color: ${theme.primaryHover} !important; }
      .text-indigo-600, .dark .dark\:text-indigo-400 { color: ${theme.primary} !important; }
      .theme-brand-accent { background: ${theme.cssGradient} !important; }
    `;

    document.title = this.currentPaper
      ? `${appName} — ${this.currentPaper.title}`
      : `${appName} — ${cfg.subLabel || "AI Paper Reader"}`;
  }

  openBrandStudioModal() {
    const cfg = window.researchDB ? window.researchDB.getBrandConfig() : {};
    const preset = cfg.themePreset || "indigo";

    const themes = [
      { id: "indigo", name: "Indigo · Purple · Pink (기본 테마)", grad: "from-indigo-600 via-purple-600 to-pink-500", desc: "차분하고 지적인 학술 스튜디오" },
      { id: "emerald", name: "Emerald · Teal · Cyan (네이처 테마)", grad: "from-emerald-500 via-teal-500 to-cyan-500", desc: "편안하고 집중력 높은 에메랄드" },
      { id: "sky", name: "Sky · Blue · Indigo (딥테크 테마)", grad: "from-sky-500 via-blue-600 to-indigo-600", desc: "명쾌하고 모던한 테크 블루" },
      { id: "rose", name: "Rose · Pink · Amber (크리에이티브 테마)", grad: "from-rose-500 via-pink-600 to-amber-500", desc: "감각적이고 따뜻한 로즈 핑크" }
    ];

    const swatchesHtml = themes.map((t) => {
      const isSelected = t.id === preset;
      return `
        <div onclick="app.selectThemePresetInModal('${t.id}')" id="theme-card-${t.id}"
             class="p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${isSelected ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30' : 'border-zinc-200 dark:border-zinc-700/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-6 h-6 rounded-lg bg-gradient-to-tr ${t.grad} shrink-0 shadow-xs"></div>
            <div class="truncate">
              <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">${this.escapeHtml(t.name)}</div>
              <div class="text-[10.5px] text-zinc-400 truncate">${this.escapeHtml(t.desc)}</div>
            </div>
          </div>
          <span id="theme-check-${t.id}" class="w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'hidden'}">
            <svg class="w-2.5 h-2.5 stroke-current fill-none stroke-3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </span>
        </div>
      `;
    }).join("");

    const html = `
      <form onsubmit="app.saveBrandStudioForm(event)" class="space-y-4 text-xs">
        <div class="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 leading-relaxed">
          <strong>🎨 프로필 & 브랜드 테마 커스터마이징:</strong> 사용자 닉네임을 설정하고, 원하는 그라데이션 테마를 선택하면 UI 전반에 반영됩니다.
        </div>

        <!-- 1. Current App Name (Context) -->
        <div class="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
          <div class="space-y-0.5">
            <span class="text-[11px] text-zinc-500 dark:text-zinc-400">현재 서비스 이름 (App Name)</span>
            <div class="font-bold text-zinc-800 dark:text-zinc-100 text-sm tracking-tight">${this.escapeHtml(cfg.appName || "Research Studio")}</div>
          </div>
          <span class="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-700/60">설정 연동됨</span>
        </div>

        <!-- 2. User Name (Nickname) Only -->
        <div class="space-y-1.5">
          <label class="block font-bold text-xs text-zinc-700 dark:text-zinc-300">사용자 표시 이름 (Nickname)</label>
          <input id="brand-input-user" type="text" required value="${this.escapeAttr(cfg.userName || "Guest")}"
                 placeholder="예: Researcher, 용재, 홍길동"
                 class="w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 font-medium transition" />
          <p class="text-[11px] text-zinc-400 dark:text-zinc-500">라이브러리 대시보드(알림 뱃지) 및 상단 프로필 등 서비스 전반에 내 닉네임이 표시됩니다.</p>
        </div>

        <!-- 3. Brand Logo Gradient Theme -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="block font-bold text-xs text-zinc-700 dark:text-zinc-300">브랜드 로고 그라데이션 테마</label>
            <span class="text-[10.5px] text-indigo-500 font-medium">UI 전체 즉시 반영</span>
          </div>

          <input type="hidden" id="brand-input-preset" value="${preset}" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${swatchesHtml}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800 flex-wrap gap-2">
          <button type="button" onclick="app.performFactoryReset()" class="px-3 py-2 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition">
            🗑️ 모든 로컬 데이터 초기화 (초기 상태로 리셋)
          </button>
          <div class="flex items-center gap-2">
            <button type="button" onclick="app.closeUniversalModal()" class="px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition">
              취소
            </button>
            <button type="submit" class="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition">
              저장하기
            </button>
          </div>
        </div>
      </form>
    `;
    this.openUniversalModal("Workspace Settings", "프로필 및 워크스페이스 브랜드 설정", html);
  }

  selectThemePresetInModal(presetId) {
    const hiddenInput = document.getElementById("brand-input-preset");
    if (hiddenInput) hiddenInput.value = presetId;
    const presets = ["indigo", "emerald", "sky", "rose"];
    presets.forEach((id) => {
      const card = document.getElementById(`theme-card-${id}`);
      const check = document.getElementById(`theme-check-${id}`);
      if (id === presetId) {
        card?.classList.add("border-indigo-600", "dark:border-indigo-400", "bg-indigo-50/40", "dark:bg-indigo-950/30", "ring-2", "ring-indigo-500/30");
        card?.classList.remove("border-zinc-200", "dark:border-zinc-700/80");
        check?.classList.remove("hidden");
      } else {
        card?.classList.remove("border-indigo-600", "dark:border-indigo-400", "bg-indigo-50/40", "dark:bg-indigo-950/30", "ring-2", "ring-indigo-500/30");
        card?.classList.add("border-zinc-200", "dark:border-zinc-700/80");
        check?.classList.add("hidden");
      }
    });
    // Live theme preview
    if (window.researchDB) {
      window.researchDB.saveBrandConfig({ themePreset: presetId });
      this.applyBrandConfigUI();
    }
  }

  saveBrandStudioForm(event) {
    if (event) event.preventDefault();
    const curCfg = window.researchDB ? window.researchDB.getBrandConfig() : {};
    const userName = document.getElementById("brand-input-user")?.value.trim() || "Guest";
    const themePreset = document.getElementById("brand-input-preset")?.value || curCfg.themePreset || "indigo";

    window.researchDB?.saveBrandConfig({
      appName: curCfg.appName || "Research Studio",
      subLabel: curCfg.subLabel || "AI Paper Reader",
      planBadge: curCfg.planBadge || "Workspace",
      userName,
      themePreset
    });

    this.applyBrandConfigUI();
    this.closeUniversalModal();
    this.showToast(`✨ 프로필 '${userName}' 및 브랜드 테마가 저장되었습니다.`);
  }

  async performFactoryReset() {
    await window.researchDB?.resetAllUserData();
    this.papers = [];
    this.relatedPapers = [];
    this.discussionsByPaper = {};
    this.userNotesByPaper = {};
    this.layoutTranslationEnabled = false;
    this.pageTranslationEnabled = false;
    window.moonlightAI?.setConfig("", "gemini-2.5-flash");
    this.applySavedAppSettingsOnBoot();
    this.updateModelPillUI();
    this.applyBrandConfigUI();
    this.syncThemeSwitchUI();
    this.closeUniversalModal();
    this.showOnboardingHome();
    this.showFloatingCard("🧹 초기화 완료", "<p>업로드된 문서, 주석, 활동 기록 및 설정이 모두 초기 사용자 상태로 비워졌습니다.</p>");
  }

  // ================= LEFT SIDEBAR (COLLAPSED vs EXPANDED) =================
  toggleLeftSidebar(forceExpand = null) {
    if (typeof forceExpand === "boolean") {
      this.leftSidebarExpanded = forceExpand;
    } else {
      this.leftSidebarExpanded = !this.leftSidebarExpanded;
    }

    const collapsedEl = document.getElementById("left-sidebar-collapsed");
    const expandedEl = document.getElementById("left-sidebar-expanded");

    if (this.leftSidebarExpanded) {
      collapsedEl?.classList.add("hidden");
      collapsedEl?.classList.remove("flex");
      expandedEl?.classList.remove("hidden");
      expandedEl?.classList.add("flex");
    } else {
      expandedEl?.classList.add("hidden");
      expandedEl?.classList.remove("flex");
      collapsedEl?.classList.remove("hidden");
      collapsedEl?.classList.add("flex");
    }
    this.refreshIcons();
  }

  switchLeftMaterialTab(tab) {
    this.leftMaterialTab = tab;
    const btnRecent = document.getElementById("tab-mat-recent");
    const btnFolder = document.getElementById("tab-mat-folder");

    if (tab === "recent") {
      if (btnRecent) {
        btnRecent.className =
          "py-1 rounded-md font-semibold flex items-center justify-center gap-1 bg-white dark:bg-[#272730] text-zinc-900 dark:text-white shadow-sm transition";
      }
      if (btnFolder) {
        btnFolder.className =
          "py-1 rounded-md font-medium flex items-center justify-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition";
      }
    } else {
      if (btnFolder) {
        btnFolder.className =
          "py-1 rounded-md font-semibold flex items-center justify-center gap-1 bg-white dark:bg-[#272730] text-zinc-900 dark:text-white shadow-sm transition";
      }
      if (btnRecent) {
        btnRecent.className =
          "py-1 rounded-md font-medium flex items-center justify-center gap-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition";
      }
    }

    this.renderLeftMaterialsList();
  }

  renderLeftMaterialsList() {
    const container = document.getElementById("left-materials-list");
    if (!container) return;

    if (this.papers.length === 0) {
      container.innerHTML = `
        <div class="px-3 py-5 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-1.5">
          <div class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">저장된 논문이 없습니다</div>
          <p class="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed">PDF를 업로드하거나 논문을 검색하면 이곳에 보관됩니다.</p>
        </div>
      `;
      return;
    }

    if (this.leftMaterialTab === "recent") {
      container.innerHTML = this.papers
        .map((p) => {
          const isSelected = p.id === this.currentPaper?.id;
          return `
            <div onclick="app.openPaper('${this.escapeAttr(p.id)}')"
                 class="group cursor-pointer w-full text-left px-2.5 py-2 rounded-xl flex items-start gap-2 transition ${
                   isSelected
                     ? "bg-zinc-200/80 dark:bg-[#25252e] text-zinc-900 dark:text-white"
                     : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                 }">
              <i data-lucide="${p.isUploadedPdf ? "file-check-2" : "file-text"}" class="w-4 h-4 mt-0.5 shrink-0 ${
                isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"
              }"></i>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-semibold truncate">${this.escapeHtml(p.shortTitle || p.title)}</div>
                <div class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center justify-between">
                  <span>${this.escapeHtml(p.timeAgo || "방금 열람")}</span>
                  <button onclick="app.deletePaperItem('${this.escapeAttr(p.id)}', event)" class="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-500 px-1" title="목록에서 제거">삭제</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    } else {
      const foldersMap = {};
      for (const p of this.papers) {
        const fName = p.folder || "기본 폴더";
        if (!foldersMap[fName]) foldersMap[fName] = [];
        foldersMap[fName].push(p);
      }

      container.innerHTML = Object.entries(foldersMap)
        .map(
          ([folderName, list]) => `
          <div class="space-y-1">
            <div class="px-2 py-1.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              <span class="flex items-center gap-1.5 truncate">
                <i data-lucide="folder" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i>
                <span class="truncate">${this.escapeHtml(folderName)}</span>
              </span>
              <span class="text-[10px] text-zinc-400">${list.length}</span>
            </div>
            <div class="pl-3 space-y-0.5">
              ${list
                .map(
                  (p) => `
                  <button onclick="app.openPaper('${this.escapeAttr(p.id)}')" class="w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    p.id === this.currentPaper?.id ? "font-bold text-indigo-600 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-400"
                  }">
                    • ${this.escapeHtml(p.shortTitle || p.title)}
                  </button>
                `
                )
                .join("")}
            </div>
          </div>
        `
        )
        .join("");
    }

    this.refreshIcons();
  }

  async deletePaperItem(paperId, event) {
    if (event) event.stopPropagation();
    await window.researchDB?.deleteUploadedPaper(paperId);
    this.papers = this.papers.filter((p) => p.id !== paperId);
    if (this.currentPaper?.id === paperId) {
      if (this.papers.length > 0) {
        await this.openPaper(this.papers[0].id);
      } else {
        this.relatedPapers = [];
        this.showOnboardingHome();
      }
    } else {
      this.renderLeftMaterialsList();
    }
  }

  // ================= PAPER LOADING & CENTER ACADEMIC SHEET RENDERING =================
  async openPaper(paperId) {
    const found = this.papers.find((p) => p.id === paperId);
    if (!found) return;

    this.currentPaper = found;
    this.activeKeywordTerm = null;
    this.currentPage = 1;
    window.moonlightAI?.resetConversation();

    const brandName = window.researchDB?.getBrandConfig()?.appName || "Research Studio";
    document.title = `${brandName} — ${found.title}`;

    // Hide onboarding screen and reveal active reader widgets
    document.getElementById("empty-workspace-onboarding")?.classList.add("hidden");
    document.getElementById("page-translate-widget")?.classList.remove("hidden");
    document.getElementById("original-pdf-pill")?.classList.remove("hidden");

    const totalPagesEl = document.getElementById("total-pages-label");
    if (totalPagesEl) totalPagesEl.textContent = String(found.totalPages || 1);
    const pageInput = document.getElementById("page-num-input");
    if (pageInput) pageInput.value = "1";

    const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
    const sheetEl = document.getElementById("paper-sheet");
    const pillLabel = document.getElementById("original-pdf-pill-label");

    if (found.isUploadedPdf) {
      if (this.renderedPdfPaperId !== found.id && window.researchDB) {
        const storedBytes = await window.researchDB.getUploadedPdfBytes(found.id);
        if (storedBytes) {
          await this.renderPdfArrayBufferToCanvas(storedBytes, found.id);
        }
      }
      if (this.renderedPdfPaperId === found.id) {
        this.showingRawPdfCanvas = true;
        pdfWrapper?.classList.remove("hidden");
        sheetEl?.classList.add("hidden");
        if (pillLabel) pillLabel.textContent = "AI 구조화 뷰로 보기";
      } else {
        this.showingRawPdfCanvas = false;
        pdfWrapper?.classList.add("hidden");
        sheetEl?.classList.remove("hidden");
        if (pillLabel) pillLabel.textContent = "원본 PDF로 보기";
      }
    } else {
      this.showingRawPdfCanvas = false;
      pdfWrapper?.classList.add("hidden");
      sheetEl?.classList.remove("hidden");
      if (pillLabel) pillLabel.textContent = "원본 PDF로 보기";
    }

    this.syncTranslationButtonsUI();
    this.updateLibrarySaveStarUI();
    this.renderLeftMaterialsList();
    this.renderCurrentPaper();
    this.renderRightPanelAll();
    this.refreshLiveRecommendations();
    this.closeFloatingCard();
    this.refreshIcons();

    this.autoHighlightsEnabled = false;
    this.applyAutoHighlights();

    if (this.layoutTranslationEnabled) {
      await this.applyActiveLayoutTranslation();
    } else if (this.pageTranslationEnabled) {
      await this.applyActivePageTranslation();
    }
  }

  renderCurrentPaper() {
    const sheet = document.getElementById("paper-sheet");
    if (!sheet || !this.currentPaper) return;
    const p = this.currentPaper;

    const basePx = window.researchDB?.getAppSettings()?.fontSizePx || 16;
    sheet.style.fontSize = `${(this.zoomLevel / 100) * basePx}px`;
    if (this.pageTranslationEnabled) {
      sheet.classList.remove("max-w-[760px]");
      sheet.classList.add("max-w-[1260px]");
    } else {
      sheet.classList.remove("max-w-[1260px]");
      sheet.classList.add("max-w-[760px]");
    }
    if (this.autoHighlightsEnabled) {
      sheet.classList.remove("highlights-off");
    } else {
      sheet.classList.add("highlights-off");
    }

    const eqMap = {};
    (p.equations || []).forEach((e) => (eqMap[e.id] = e));
    const figMap = {};
    (p.figures || []).forEach((f) => (figMap[f.id] = f));

    const displayTitle = this.layoutTranslationEnabled ? p.titleKo || p.title : p.title;
    const displayAbstract = this.layoutTranslationEnabled ? p.abstractKo || p.abstractEn : p.abstractEn;

    const sectionsHtml = (p.sections || [])
      .map((sec) => {
        const headingText = this.layoutTranslationEnabled
          ? this.escapeHtml(sec.titleKo || `${sec.number}  ${sec.title}`)
          : `${this.escapeHtml(sec.number)}&nbsp;&nbsp;&nbsp;${this.escapeHtml(sec.title)}`;

        const parasHtml = (sec.paragraphs || [])
          .map((para) => {
            const bodyContent = this.layoutTranslationEnabled
              ? this.decorateKoreanParagraphHtml(para)
              : this.decorateEnglishParagraphHtml(para);

            const splitRowHtml = this.pageTranslationEnabled
              ? `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                   <p>${this.decorateEnglishParagraphHtml(para)}</p>
                   <div class="p-3.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 font-sans page-trans-scalable-text text-zinc-800 dark:text-zinc-100">
                     ${para.ko ? this.decorateKoreanParagraphHtml(para) : `<span class="text-zinc-400 italic">⏳ 원문 번역 중...</span>`}
                   </div>
                 </div>`
              : `<p>${bodyContent}</p>`;

            let eqBlock = "";
            if (para.equationId && eqMap[para.equationId]) {
              const eq = eqMap[para.equationId];
              eqBlock = `
                <div onclick="app.openEquationModal('${this.escapeAttr(eq.id)}')"
                     class="my-5 p-4 rounded-xl bg-zinc-100/80 dark:bg-[#23232b] border border-zinc-200 dark:border-zinc-700/70 hover:border-indigo-500/60 cursor-pointer transition group">
                  <div class="flex items-center justify-between text-xs font-sans mb-2">
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">${this.escapeHtml(eq.label)} · ${this.escapeHtml(eq.title)}</span>
                    <span class="text-[11px] text-zinc-500 group-hover:text-indigo-400 transition">✨ 클릭하여 수식 기호 해부 & LaTeX 복사</span>
                  </div>
                  <div class="py-1 text-center overflow-x-auto text-base">
                    ${this.renderLatexToString(eq.latex, true)}
                  </div>
                </div>
              `;
            }

            let figBlock = "";
            if (para.figureId && figMap[para.figureId]) {
              const fig = figMap[para.figureId];
              figBlock = `
                <div onclick="app.openFigureModal('${this.escapeAttr(fig.id)}')"
                     class="my-5 p-4 rounded-xl bg-zinc-100/80 dark:bg-[#23232b] border border-zinc-200 dark:border-zinc-700/70 hover:border-blue-500/60 cursor-pointer transition font-sans group">
                  <div class="flex items-center justify-between text-xs mb-2">
                    <span class="font-bold text-blue-600 dark:text-blue-400">🖼️ ${this.escapeHtml(fig.label)}: ${this.escapeHtml(fig.title)}</span>
                    <span class="text-[11px] text-zinc-500 group-hover:text-blue-400 transition">클릭하여 도표 설명 보기</span>
                  </div>
                  <div class="overflow-x-auto my-2">
                    <table class="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr class="border-b border-zinc-300 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/70">
                          ${(fig.headers || []).map((h) => `<th class="py-1.5 px-2 font-semibold">${this.escapeHtml(h)}</th>`).join("")}
                        </tr>
                      </thead>
                      <tbody>
                        ${(fig.rows || [])
                          .map(
                            (r) => `
                            <tr class="border-b border-zinc-200/70 dark:border-zinc-800">
                              ${r.map((c) => `<td class="py-1.5 px-2">${this.escapeHtml(c)}</td>`).join("")}
                            </tr>`
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                  <p class="text-[11px] text-zinc-500 dark:text-zinc-400 italic mt-1">${this.escapeHtml(fig.caption)}</p>
                </div>
              `;
            }

            return `
              <div id="${this.escapeAttr(para.id)}" class="mb-4 text-[1.03em] leading-[1.72] text-justify">
                ${splitRowHtml}
                ${eqBlock}
                ${figBlock}
              </div>
            `;
          })
          .join("");

        return `
          <section id="${this.escapeAttr(sec.id)}" class="mt-8">
            <h2 class="text-lg sm:text-xl font-bold mb-3 flex items-center">
              <span>${headingText}</span>
              <button onclick="app.inspectSectionHeading('${this.escapeAttr(sec.id)}', event)" class="heading-scan-btn" title="이 섹션 AI 핵심 요약 및 분석">
                <i data-lucide="scan" class="w-3.5 h-3.5"></i>
              </button>
            </h2>
            ${parasHtml}
          </section>
        `;
      })
      .join("");

    sheet.innerHTML = `
      <div class="arxiv-vertical-stamp absolute left-2 sm:left-3.5 top-28 bottom-16 text-lg sm:text-2xl text-zinc-400/55 dark:text-zinc-500/60 font-normal">
        ${this.escapeHtml(p.arxivStamp || p.arxivId)}
      </div>

      <div class="${this.pageTranslationEnabled ? "max-w-[1120px]" : "max-w-[590px]"} mx-auto">
        <header class="text-center mb-8">
          <h1 class="text-2xl sm:text-[26px] font-normal leading-[1.35] tracking-tight inline">
            ${this.escapeHtml(displayTitle)}
          </h1>
          <button onclick="app.inspectPaperTitle(event)" class="heading-scan-btn" title="논문 전체 핵심 AI 브리핑 보기">
            <i data-lucide="scan" class="w-3.5 h-3.5"></i>
          </button>

          <div class="mt-5 text-[15px] font-normal">
            ${(p.authors || []).map((a) => this.escapeHtml(a)).join(" and ")}
          </div>

          <div class="mt-3 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300 space-y-0.5">
            ${(p.affiliationsLines || [])
              .map((line) =>
                line.includes("@")
                  ? `<div class="font-mono text-[12px] pt-0.5">${this.escapeHtml(line)}</div>`
                  : `<div>${this.escapeHtml(line)}</div>`
              )
              .join("")}
            ${
              p.landingUrl
                ? `<div class="pt-1 font-sans">
                     <a href="${this.escapeAttr(p.landingUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline">
                       🔗 원문 외부 링크 열기 (External Link)
                     </a>
                   </div>`
                : ""
            }
          </div>
        </header>

        <div class="px-4 sm:px-7 mb-8 space-y-4 text-[13.5px] leading-[1.62] text-justify">
          <p>
            <strong class="font-bold">Abstract.</strong>
            ${this.escapeHtml(displayAbstract)}
          </p>

          <p>
            <strong class="font-bold">Keywords:</strong>
            ${(p.keywordsList || [])
              .map(
                (kw) =>
                  `<span onclick="app.selectKeywordPill('${this.escapeAttr(kw)}')" class="cursor-pointer hover:text-indigo-500 hover:underline transition">${this.escapeHtml(kw)}</span>`
              )
              .join(", ")}
          </p>
        </div>

        <div>
          ${sectionsHtml}
        </div>
      </div>
    `;

    this.refreshIcons();
  }

  replaceOutsideHtmlTags(html, regex, replacer) {
    return html
      .split(/(<[^>]+>)/g)
      .map((part) => (part.startsWith("<") ? part : part.replace(regex, replacer)))
      .join("");
  }

  decorateEnglishParagraphHtml(para) {
    let html = this.escapeHtml(para.en);

    for (const hl of para.highlights || []) {
      const escapedPhrase = this.escapeHtml(hl.phrase);
      if (escapedPhrase && html.includes(escapedPhrase)) {
        const clsMap = {
          novelty: "hl-novelty",
          methodology: "hl-methodology",
          result: "hl-result",
          formula: "hl-formula"
        };
        const cls = clsMap[hl.category] || "hl-novelty";
        html = html.replace(
          escapedPhrase,
          `<span onclick="app.inspectHighlight('${this.escapeAttr(hl.id)}', event)" class="ai-highlight ${cls}" title="클릭하여 AI 하이라이트 해설 보기">${escapedPhrase}</span>`
        );
      }
    }

    const userNotes = this.userNotesByPaper[this.currentPaper?.id] || [];
    for (const un of userNotes) {
      const escapedUser = this.escapeHtml(un.phrase);
      if (escapedUser.length > 4 && html.includes(escapedUser)) {
        let colorCls = "hl-user-pink";
        if (un.color === "yellow") colorCls = "hl-user-yellow";
        else if (un.color === "green") colorCls = "hl-user-green";
        else if (un.color === "cyan" || un.color === "blue") colorCls = "hl-user-cyan";
        else if (un.color === "coral" || un.color === "peach" || un.color === "red") colorCls = "hl-user-coral";
        else if (un.color === "purple") colorCls = "hl-user-purple";
        html = this.replaceOutsideHtmlTags(
          html,
          new RegExp(this.escapeRegExp(escapedUser)),
          `<span onclick="app.inspectUserNote('${this.escapeAttr(un.id)}', event)" class="ai-highlight ${colorCls}" title="내 주석: ${this.escapeAttr(un.note)}">${escapedUser}</span>`
        );
      }
    }

    html = this.replaceOutsideHtmlTags(
      html,
      /\b((?:Figure|Fig\.|Table|Equation|Eq\.|Section)\s*\(?\d+\)?)/g,
      (match) =>
        `<span onclick="app.previewInternalRef('${this.escapeAttr(match)}', event)" class="internal-ref-link" title="${this.escapeAttr(match)} 인라인 미리보기">${match}</span>`
    );

    html = this.replaceOutsideHtmlTags(html, /\[(\d+(?:,\s*\d+)*)\]/g, (match, numsStr) => {
      const firstNum = numsStr.split(",")[0].trim();
      return `<span onclick="app.openCitationPreview('${this.escapeAttr(firstNum)}', event)" class="citation-link" title="스마트 인용 [${this.escapeAttr(numsStr)}] 미리보기">[${numsStr}]</span>`;
    });

    return html;
  }

  decorateKoreanParagraphHtml(para) {
    let html = this.escapeHtml(para.ko || para.en);

    html = this.replaceOutsideHtmlTags(
      html,
      /\b((?:Figure|Fig\.|Table|Equation|Eq\.|Section)\s*\(?\d+\)?)/g,
      (match) =>
        `<span onclick="app.previewInternalRef('${this.escapeAttr(match)}', event)" class="internal-ref-link" title="${this.escapeAttr(match)} 인라인 미리보기">${match}</span>`
    );

    html = this.replaceOutsideHtmlTags(html, /\[(\d+(?:,\s*\d+)*)\]/g, (match, numsStr) => {
      const firstNum = numsStr.split(",")[0].trim();
      return `<span onclick="app.openCitationPreview('${this.escapeAttr(firstNum)}', event)" class="citation-link">[${numsStr}]</span>`;
    });

    return `<span class="ai-highlight hl-novelty">${html}</span>`;
  }

  // ================= INLINE SECTION / FIGURE / EQUATION PREVIEW =================
  previewInternalRef(refLabel, event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;

    const clean = (refLabel || "").trim();
    const numMatch = clean.match(/\d+/);
    const num = numMatch ? numMatch[0] : "1";
    const lower = clean.toLowerCase();

    if (lower.startsWith("eq")) {
      const eq =
        (this.currentPaper.equations || []).find((e) => e.label.includes(`(${num})`) || e.label.includes(num)) ||
        this.currentPaper.equations?.[0];
      if (eq) {
        const html = `
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-300 font-bold text-xs">📐 수식 인라인 프리뷰 · ${this.escapeHtml(eq.label)}</span>
              <button onclick="app.openEquationModal('${this.escapeAttr(eq.id)}')" class="text-xs text-indigo-500 hover:underline font-semibold">기호 상세 보기 →</button>
            </div>
            <div class="font-bold text-xs sm:text-sm">${this.escapeHtml(eq.title)}</div>
            <div class="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-center overflow-x-auto">
              ${this.renderLatexToString(eq.latex, true)}
            </div>
            <p class="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">${this.escapeHtml(eq.summary)}</p>
          </div>
        `;
        this.showFloatingCard(`🔍 인라인 참조 미리보기 — ${clean}`, html);
        return;
      }
    }

    if (lower.startsWith("sec")) {
      const sec =
        (this.currentPaper.sections || []).find((s) => String(s.number) === num) ||
        this.currentPaper.sections?.[0];
      if (sec) {
        const previewPara = sec.paragraphs?.[0]?.ko || sec.paragraphs?.[0]?.en || "";
        const html = `
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-300 font-bold text-xs">📑 섹션 프리뷰 (스크롤 유지)</span>
              <button onclick="document.getElementById('${this.escapeAttr(sec.id)}')?.scrollIntoView({behavior:'smooth'}); app.closeFloatingCard();" class="text-xs text-indigo-500 hover:underline font-semibold">해당 섹션으로 이동 ↓</button>
            </div>
            <div class="font-bold text-sm">${this.escapeHtml(sec.titleKo || sec.title)}</div>
            <p class="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">${this.escapeHtml(previewPara.slice(0, 260))}...</p>
          </div>
        `;
        this.showFloatingCard(`🔍 섹션 미리보기 — ${clean}`, html);
        return;
      }
    }

    const fig =
      (this.currentPaper.figures || []).find(
        (f) =>
          f.label.toLowerCase().includes(clean.toLowerCase()) ||
          (lower.includes("table") && f.label.toLowerCase().includes("table")) ||
          f.label.includes(num)
      ) || this.currentPaper.figures?.[0];

    if (fig) {
      const html = `
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="px-2 py-0.5 rounded bg-teal-500/15 text-teal-600 dark:text-teal-300 font-bold text-xs">🖼️ 도표 인라인 프리뷰 · ${this.escapeHtml(fig.label)}</span>
            <button onclick="app.openFigureModal('${this.escapeAttr(fig.id)}')" class="text-xs text-indigo-500 hover:underline font-semibold">전체 도표 보기 →</button>
          </div>
          <div class="font-bold text-xs sm:text-sm">${this.escapeHtml(fig.title)}</div>
          <div class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs leading-relaxed">
            ${this.escapeHtml(fig.aiInsight)}
          </div>
          <p class="text-[11px] text-zinc-500 italic">${this.escapeHtml(fig.caption)}</p>
        </div>
      `;
      this.showFloatingCard(`🔍 인라인 도표 미리보기 — ${clean}`, html);
    } else {
      this.showFloatingCard(
        `🔍 참조 미리보기 — ${clean}`,
        `<p>본문에서 참조된 <strong>${this.escapeHtml(clean)}</strong> 항목입니다. 상단 <strong>[영역 캡처 설명]</strong> 버튼으로 도표나 수식을 드래그하면 즉시 비전 분석을 수행합니다.</p>`
      );
    }
  }

  // ================= RIGHT AI PANEL RENDERING (Supports Empty State & Active Paper) =================
  renderRightPanelAll() {
    this.renderKeywordSection();
    this.renderThreeLineSection();
    this.renderSummarySection();
    this.renderDiscussionSection();
    this.renderBottomPromptChips();
    if (this.currentPaper) {
      this.generateModelRecommendedQuestions();
    }
  }

  renderKeywordSection() {
    const container = document.getElementById("keyword-pills-container");
    const detailBox = document.getElementById("keyword-detail-box");
    const expandBtn = document.getElementById("btn-expand-keywords");
    const expandLabel = document.getElementById("label-expand-keywords");
    if (!container) return;

    if (!this.currentPaper) {
      container.innerHTML = `<p class="text-xs text-zinc-400 dark:text-zinc-500">논문을 열면 핵심 전문 용어 사전이 자동 생성됩니다.</p>`;
      detailBox?.classList.add("hidden");
      expandBtn?.classList.add("hidden");
      return;
    }

    expandBtn?.classList.remove("hidden");
    const dict = this.currentPaper.keywordDictionary || [];
    const visibleItems = this.expandKeywordsAll ? dict : dict.slice(0, 4);

    if (expandLabel) {
      expandLabel.textContent = this.expandKeywordsAll ? "접기" : "전체 보기";
    }

    container.innerHTML = visibleItems
      .map((item) => {
        const isActive = this.activeKeywordTerm === item.term;
        return `
          <button onclick="app.selectKeywordPill('${this.escapeAttr(item.term)}')"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    isActive
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                      : "bg-zinc-100 dark:bg-[#23232b] hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-zinc-200/80 dark:border-zinc-700/80"
                  }">
            ${this.escapeHtml(item.term)}
          </button>
        `;
      })
      .join("");

    if (this.activeKeywordTerm) {
      const found = dict.find(
        (d) =>
          d.term.toLowerCase() === this.activeKeywordTerm.toLowerCase() ||
          this.activeKeywordTerm.toLowerCase().includes(d.term.toLowerCase()) ||
          d.term.toLowerCase().includes(this.activeKeywordTerm.toLowerCase())
      );
      if (found && detailBox) {
        detailBox.classList.remove("hidden");
        detailBox.innerHTML = `
          <div class="flex items-center justify-between">
            <span class="font-bold text-indigo-600 dark:text-indigo-400">📘 ${this.escapeHtml(found.termKo)}</span>
            <button onclick="app.selectKeywordPill(null)" class="text-zinc-400 hover:text-zinc-600">✕</button>
          </div>
          <p class="text-zinc-700 dark:text-zinc-200 leading-relaxed pt-1">${this.escapeHtml(found.definition)}</p>
          <div class="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium pt-1">🎯 역할: ${this.escapeHtml(found.importance)}</div>
        `;
      }
    } else if (detailBox) {
      detailBox.classList.add("hidden");
    }
  }

  selectKeywordPill(term) {
    if (!term || this.activeKeywordTerm === term) {
      this.activeKeywordTerm = null;
    } else {
      this.activeKeywordTerm = term;
    }
    this.renderKeywordSection();
  }

  toggleExpandKeywords() {
    if (!this.currentPaper) return;
    this.expandKeywordsAll = !this.expandKeywordsAll;
    this.renderKeywordSection();
  }

  renderThreeLineSection() {
    const container = document.getElementById("threeline-list-container");
    const expandLabel = document.getElementById("label-expand-threeline");
    if (!container) return;

    if (!this.currentPaper) {
      container.innerHTML = `<p class="text-xs text-zinc-400 dark:text-zinc-500">논문을 업로드하거나 선택하면 3줄 핵심 요약이 표시됩니다.</p>`;
      return;
    }

    const lines = this.currentPaper.threeLineSummary || [];
    if (expandLabel) {
      expandLabel.textContent = this.expandThreeLineAll ? "접기" : "전체 보기";
    }

    if (this.expandThreeLineAll) {
      container.innerHTML = lines
        .map(
          (line, idx) => `
          <div class="flex items-start gap-1.5">
            <span class="font-bold text-zinc-500 shrink-0">${idx + 1}.</span>
            <span>${this.escapeHtml(line)}</span>
          </div>
        `
        )
        .join("");
    } else {
      const first = lines[0] || "";
      const second = lines[1] ? lines[1].slice(0, 32) + "..." : "";
      container.innerHTML = `
        <div class="flex items-start gap-1.5">
          <span class="font-bold text-zinc-500 shrink-0">1.</span>
          <span>${this.escapeHtml(first)}</span>
        </div>
        ${
          second
            ? `<div class="flex items-start gap-1.5 opacity-35 text-[11px]">
                 <span class="font-bold text-zinc-500 shrink-0">2.</span>
                 <span class="truncate">${this.escapeHtml(second)}</span>
               </div>`
            : ""
        }
      `;
    }
  }

  toggleExpandThreeLine() {
    if (!this.currentPaper) return;
    this.expandThreeLineAll = !this.expandThreeLineAll;
    this.renderThreeLineSection();
  }

  renderSummarySection() {
    const container = document.getElementById("summary-text-container");
    const expandLabel = document.getElementById("label-expand-summary");
    if (!container) return;

    if (!this.currentPaper) {
      container.innerHTML = `<p class="text-xs text-zinc-400 dark:text-zinc-500">문서 구조 분석 후 전체 요약이 이곳에 생성됩니다.</p>`;
      return;
    }

    const fullText = this.currentPaper.summaryText || "";
    if (expandLabel) {
      expandLabel.textContent = this.expandSummaryAll ? "접기" : "전체 보기";
    }

    if (this.expandSummaryAll) {
      container.innerHTML = this.renderMarkdownWithMath(fullText);
    } else {
      const shortText = fullText.length > 155 ? fullText.slice(0, 155) + "..." : fullText;
      container.innerHTML = this.renderMarkdownWithMath(shortText);
    }
  }

  toggleExpandSummary() {
    if (!this.currentPaper) return;
    this.expandSummaryAll = !this.expandSummaryAll;
    this.renderSummarySection();
  }

  getActiveDiscussionKey() {
    const pid = this.currentPaper ? this.currentPaper.id : "__general__";
    return `${pid}__${this.currentThreadId}`;
  }

  renderDiscussionSection() {
    const container = document.getElementById("discussion-messages-list");
    if (!container) return;

    const key = this.getActiveDiscussionKey();
    const msgs = this.discussionsByPaper[key] || [];

    if (msgs.length === 0) {
      if (!this.currentPaper) {
        container.innerHTML = `
          <div class="p-3 rounded-xl bg-zinc-100/80 dark:bg-[#1a1a22] border border-zinc-200/70 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            열람 중인 논문이 없습니다. 중앙 화면에서 <strong>PDF를 업로드</strong>하거나 <strong>실시간 논문 검색</strong>으로 문서를 열면 심층 질의응답이 활성화됩니다.
          </div>
        `;
      } else {
        container.innerHTML = "";
      }
      return;
    }

    container.innerHTML = msgs
      .map((m) => {
        if (m.role === "user") {
          return `
            <div class="flex justify-end">
              <div class="max-w-[88%] rounded-2xl rounded-tr-sm bg-indigo-600 text-white px-3 py-2 text-xs leading-relaxed">
                ${m.context ? `<div class="text-[10px] bg-indigo-800/70 rounded px-1.5 py-0.5 mb-1 truncate italic">📌 "${this.escapeHtml(m.context)}"</div>` : ""}
                ${this.escapeHtml(m.content)}
              </div>
            </div>
          `;
        } else {
          const modelTag = m.modelName || window.moonlightAI?.getModelDisplayName() || "AI 연구 동료";
          return `
            <div class="rounded-2xl bg-zinc-100 dark:bg-[#1c1c24] border border-zinc-200/80 dark:border-zinc-800 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 ai-prose">
              <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-zinc-200/60 dark:border-zinc-800/80 text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400 select-none">
                <span class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>${this.escapeHtml(modelTag)} 분석</span>
                </span>
                <span class="text-zinc-400 font-normal">${this.escapeHtml(m.time || "방금 전")}</span>
              </div>
              ${this.renderMarkdownWithMath(m.content)}
            </div>
          `;
        }
      })
      .join("");

    const scrollParent = document.getElementById("right-scroll-sections");
    if (scrollParent) {
      scrollParent.scrollTop = scrollParent.scrollHeight;
    }
  }

  renderBottomPromptChips() {
    const container = document.getElementById("bottom-prompt-chips");
    const label = document.getElementById("suggested-questions-source-label");
    if (!container) return;

    const activeModelName = window.moonlightAI ? window.moonlightAI.getModelDisplayName() : "AI";

    if (!this.currentPaper) {
      if (label) label.textContent = `${activeModelName}의 추천 질문`;
      container.innerHTML = `
        <button onclick="app.askSuggestedQuestion('이 플랫폼의 핵심 기능과 논문 분석 방법을 알려줘')"
                class="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-[#1e1e26] hover:bg-indigo-500/15 border border-zinc-200 dark:border-zinc-700/80 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition shrink-0">
          ✨ 플랫폼 사용법 및 핵심 기능 질문
        </button>
      `;
      return;
    }

    if (label) {
      label.innerHTML = `
        <div class="flex items-center justify-between w-full">
          <span>✦ <strong class="text-indigo-600 dark:text-indigo-400">${this.escapeHtml(activeModelName)}</strong>의 논문 추론 추천 질문 (3가지)</span>
          <button onclick="app.generateModelRecommendedQuestions(true)" class="hover:text-indigo-500 p-0.5 rounded transition text-zinc-400 hover:text-indigo-600" title="추천 질문 다시 추론">
            ↻ 새로고침
          </button>
        </div>
      `;
    }

    const chips = (this.currentPaper.suggestedQuestions && this.currentPaper.suggestedQuestions.length >= 3)
      ? this.currentPaper.suggestedQuestions.slice(0, 3)
      : this.getDefaultPaperSuggestedQuestions(this.currentPaper);

    container.innerHTML = chips
      .map(
        (q, idx) => `
        <button onclick="app.askSuggestedQuestion('${this.escapeAttr(q)}')"
                title="클릭하여 질문하기: ${this.escapeAttr(q)}"
                class="group/chip px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-[#1e1e26] hover:bg-indigo-500/15 hover:border-indigo-500/40 border border-zinc-200 dark:border-zinc-700/80 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition shrink-0 flex items-center gap-1.5 shadow-xs">
          <span class="w-3.5 h-3.5 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9.5px] font-bold flex items-center justify-center shrink-0">Q${idx + 1}</span>
          <span class="group-hover/chip:text-indigo-600 dark:group-hover/chip:text-indigo-300 transition-colors">${this.escapeHtml(q)}</span>
        </button>
      `
      )
      .join("");
  }

  getDefaultPaperSuggestedQuestions(paper) {
    if (!paper) return ["이 논문의 핵심이 뭐야?", "기존 연구랑 뭐가 달라?", "한계점이 뭐야?"];
    const title = paper.title || "본 논문";
    const kw1 = (paper.keywordsList && paper.keywordsList[0]) || "제안 방법론";
    const kw2 = (paper.keywordsList && paper.keywordsList[1]) || "실험 성능";
    return [
      `《${title}》에서 제안한 ${kw1}의 핵심 작동 원리와 독창성은 무엇인가요?`,
      `기존 연구 및 베이스라인 대비 ${kw2} 측면에서 어떠한 차별적 성과를 입증했나요?`,
      `이 연구의 실질적인 적용 한계점과 후속 연구로 다루어야 할 과제는 무엇인가요?`
    ];
  }

  async generateModelRecommendedQuestions(force = false) {
    if (!this.currentPaper) {
      this.renderBottomPromptChips();
      return;
    }

    const activeModel = window.moonlightAI?.getActiveModel() || "gemini-2.5-flash";
    const cacheKey = `${this.currentPaper.id}__${activeModel}`;

    if (!force && this.paperModelQuestionCache && this.paperModelQuestionCache[cacheKey]) {
      this.currentPaper.suggestedQuestions = this.paperModelQuestionCache[cacheKey];
      this.renderBottomPromptChips();
      return;
    }

    // 1. Immediate default questions for instant UX
    this.currentPaper.suggestedQuestions = this.getDefaultPaperSuggestedQuestions(this.currentPaper);
    this.renderBottomPromptChips();

    // 2. In background, infer questions from the active model if verified
    const provider = window.moonlightAI?.getModelProvider(activeModel);
    if (window.moonlightAI?.isProviderVerified(provider)) {
      try {
        const inferred = await window.moonlightAI.inferRecommendedQuestions(this.currentPaper, activeModel);
        if (inferred && inferred.length >= 3) {
          this.paperModelQuestionCache = this.paperModelQuestionCache || {};
          this.paperModelQuestionCache[cacheKey] = inferred;
          this.currentPaper.suggestedQuestions = inferred;
          this.renderBottomPromptChips();
        }
      } catch (err) {
        console.warn("AI recommended questions inference fallback:", err);
      }
    }
  }

  // ================= ACCORDION, COPY & REFRESH ACTIONS =================
  toggleAccordion(secName) {
    this.accordionOpen[secName] = !this.accordionOpen[secName];
    const body = document.getElementById(`acc-body-${secName}`);
    const icon = document.getElementById(`acc-icon-${secName}`);
    if (this.accordionOpen[secName]) {
      body?.classList.remove("hidden");
      icon?.classList.remove("-rotate-90");
    } else {
      body?.classList.add("hidden");
      icon?.classList.add("-rotate-90");
    }
  }

  copySectionText(secName) {
    if (!this.requireActivePaper("요약/키워드 복사")) return;
    let text = "";
    if (secName === "keywords") {
      text = (this.currentPaper.keywordsList || []).join(", ");
    } else if (secName === "threeline") {
      text = (this.currentPaper.threeLineSummary || []).map((l, i) => `${i + 1}. ${l}`).join("\n");
    } else if (secName === "summary") {
      text = this.currentPaper.summaryText || "";
    }
    navigator.clipboard?.writeText(text);
    this.showFloatingCard(
      "📋 클립보드 복사 완료",
      `<p>선택하신 섹션의 텍스트가 클립보드에 복사되었습니다.</p><blockquote class="mt-2 p-2 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">${this.escapeHtml(text)}</blockquote>`
    );
  }

  async refreshSection(secName) {
    if (!this.currentPaper || !window.moonlightAI) return;
    if (secName === "keywords") {
      this.expandKeywordsAll = true;
      const c = document.getElementById("keyword-pills-container");
      if (c) c.innerHTML = `<span class="text-xs text-indigo-500 font-semibold animate-pulse">⏳ 키워드 사전 프롬프트로 재분석 중...</span>`;
      await window.moonlightAI.localizeAndEnrichPaper(this.currentPaper, "keywords");
      this.renderKeywordSection();
    } else if (secName === "threeline") {
      this.expandThreeLineAll = true;
      const c = document.getElementById("threeline-list-container");
      if (c) c.innerHTML = `<span class="text-xs text-indigo-500 font-semibold animate-pulse">⏳ 3줄 요약 프롬프트로 다시 생성 중...</span>`;
      await window.moonlightAI.localizeAndEnrichPaper(this.currentPaper, "threeline");
      this.renderThreeLineSection();
    } else if (secName === "summary") {
      this.expandSummaryAll = true;
      const c = document.getElementById("summary-text-container");
      if (c) c.innerHTML = `<span class="text-xs text-indigo-500 font-semibold animate-pulse">⏳ 요약 프롬프트로 다시 생성 중...</span>`;
      await window.moonlightAI.localizeAndEnrichPaper(this.currentPaper, "summary");
      this.renderSummarySection();
    }
  }

  // ================= CHAT & DISCUSSION HANDLERS =================
  async askSuggestedQuestion(question) {
    const input = document.getElementById("chat-input");
    if (input) input.value = question;
    await this.handleChatSubmit(null);
  }

  cycleRandomSuggestedPrompt() {
    if (!this.requireActivePaper("추천 질문")) return;
    this.generateModelRecommendedQuestions(true);
  }

  async handleChatSubmit(event) {
    if (event) event.preventDefault();
    const input = document.getElementById("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    const key = this.getActiveDiscussionKey();
    if (!this.discussionsByPaper[key]) this.discussionsByPaper[key] = [];

    const contextQuote = this.attachedContextQuote;
    const extraRefs = [...this.attachedExtraPapers];
    this.clearChatAttachment();

    this.discussionsByPaper[key].push({
      role: "user",
      content: text,
      context: contextQuote
    });

    this.discussionsByPaper[key].push({
      role: "assistant",
      content: "⏳ *AI 연구 동료가 답변을 생성하고 있습니다...*"
    });
    this.renderDiscussionSection();

    const activeModelName = window.moonlightAI ? window.moonlightAI.getModelDisplayName() : "AI 연구 동료";

    let answer = "";
    try {
      answer = await window.moonlightAI.chat(
        text,
        this.currentPaper,
        contextQuote,
        extraRefs
      );

      this.discussionsByPaper[key].pop();
      this.discussionsByPaper[key].push({
        role: "assistant",
        content: answer || "답변을 생성하지 못했습니다. 잠시 후 다시 질문해 주세요.",
        modelName: activeModelName,
        time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      });
    } catch (err) {
      console.error("Chat invocation error:", err);
      this.discussionsByPaper[key].pop();
      this.discussionsByPaper[key].push({
        role: "assistant",
        content: `⚠️ **답변 생성 중 오류가 발생했습니다:** ${this.escapeHtml(err.message || "네트워크 연결을 확인해 주세요.")}\n\n*상단 ⚙️ 설정에서 API 키가 올바른지 확인하거나 다른 활성 모델로 변경해 보세요.*`,
        modelName: activeModelName,
        time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      });
    } finally {
      this.renderDiscussionSection();
    }

    if (this.currentPaper && answer) {
      window.researchDB?.logActivity({
        type: "ai_chat",
        paperId: this.currentPaper.id,
        paperTitle: this.currentPaper.title,
        quote: text,
        detail: answer.slice(0, 180)
      });
    }
  }

  switchDiscussionThread(threadId) {
    this.currentThreadId = threadId;
    if (this.currentPaper) {
      const key = this.getActiveDiscussionKey();
      if (!this.discussionsByPaper[key]) {
        if (threadId === "thread-method") {
          this.discussionsByPaper[key] = [
            { role: "user", content: "기존 연구랑 뭐가 달라?" },
            {
              role: "assistant",
              content: `**《${this.currentPaper.title}》의 방법론적 특징:**\n\n- ${this.currentPaper.threeLineSummary?.[0] || ""}\n- ${this.currentPaper.threeLineSummary?.[1] || ""}`
            }
          ];
        } else if (threadId === "thread-math") {
          const eq = this.currentPaper.equations?.[0];
          this.discussionsByPaper[key] = [
            { role: "user", content: "핵심 수식과 원리를 설명해줘" },
            {
              role: "assistant",
              content: eq
                ? `**${eq.label}: ${eq.title}**\n$$${eq.latex}$$\n\n${eq.summary}`
                : this.currentPaper.summaryText
            }
          ];
        }
      }
    }
    this.renderDiscussionSection();
  }

  startNewDiscussionThread() {
    this.currentThreadId = `custom-${Date.now()}`;
    const select = document.getElementById("discussion-thread-select");
    if (select) {
      const opt = document.createElement("option");
      opt.value = this.currentThreadId;
      opt.textContent = `💬 새 대화 (${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`;
      select.appendChild(opt);
      select.value = this.currentThreadId;
    }
    this.renderDiscussionSection();
    document.getElementById("chat-input")?.focus();
  }

  clearCurrentDiscussion() {
    const key = this.getActiveDiscussionKey();
    this.discussionsByPaper[key] = [];
    this.renderDiscussionSection();
  }

  // ================= BOUNDING-BOX REGION CAPTURE (VISION + LATEX COPY) =================
  activateRegionCapture() {
    if (!this.requireActivePaper("바운딩 박스 영역 캡처")) return;
    if (!window.pdfEngine) return;
    this.closeFloatingCard();

    window.pdfEngine.startRegionCapture(async ({ rect, imageDataUrl, extractedText }) => {
      this.openUniversalModal(
        "Multimodal Vision & LaTeX",
        "바운딩 박스 영역 AI 비전 설명 & 수식 추출",
        `
          <div class="space-y-4">
            <div class="p-3 rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col items-center">
              <img src="${imageDataUrl}" alt="Captured Region" class="max-h-52 rounded-lg border border-indigo-500/40 object-contain" />
              <span class="text-[11px] text-zinc-400 mt-2">캡처 영역 크기: ${Math.round(rect.width)} × ${Math.round(rect.height)} px</span>
            </div>
            <div class="flex items-center gap-2 text-indigo-500 py-3 justify-center font-semibold text-xs">
              <div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span>멀티모달 비전 엔진이 수식·그래프·표 구조를 분석하고 있습니다...</span>
            </div>
          </div>
        `
      );

      const analysis = await window.moonlightAI.analyzeCroppedRegion(
        imageDataUrl,
        extractedText,
        this.currentPaper
      );

      this.lastFloatingResult = {
        selectedText: extractedText || "바운딩 박스 캡처 영역",
        resultMarkdown: analysis.markdown
      };

      window.researchDB?.logActivity({
        type: "capture",
        paperId: this.currentPaper.id,
        paperTitle: this.currentPaper.title,
        quote: (extractedText || "도표/수식 이미지 영역 캡처").slice(0, 120),
        detail: analysis.detectedLatex ? `LaTeX: ${analysis.detectedLatex}` : "영역 비전 분석 완료"
      });

      const formattedLatex = analysis.detectedLatex
        ? window.moonlightAI.formatLatexWithDelimiter(analysis.detectedLatex, true)
        : "";
      const encodedLatex = encodeURIComponent(formattedLatex);
      const bodyEl = document.getElementById("umodal-body");
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="space-y-4">
            <div class="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col items-center">
              <img src="${imageDataUrl}" alt="Captured Region" class="max-h-48 rounded-lg border border-indigo-500/40 object-contain" />
            </div>

            <div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 ai-prose leading-relaxed">
              ${this.renderMarkdownWithMath(analysis.markdown)}
            </div>

            ${
              formattedLatex
                ? `
              <div class="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-indigo-600 dark:text-indigo-300">📐 추출된 LaTeX 수식 코드 (설정된 구분 기호 적용)</span>
                  <button onclick="app.copyCapturedLatex('${encodedLatex}', this)"
                          class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">
                    LaTeX 코드 복사
                  </button>
                </div>
                <pre class="p-2.5 rounded-lg bg-zinc-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">${this.escapeHtml(formattedLatex)}</pre>
              </div>
            `
                : ""
            }

            <div class="flex justify-end gap-2 pt-1">
              <button onclick="app.closeUniversalModal(); app.continueFloatingCardInChat();"
                      class="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">
                💬 토론 창으로 보내서 후속 질문하기
              </button>
            </div>
          </div>
        `;
      }
    });
  }

  copyCapturedLatex(encodedLatex, btnEl) {
    const latex = decodeURIComponent(encodedLatex || "");
    navigator.clipboard?.writeText(latex);
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = "복사 완료 ✓";
      setTimeout(() => {
        btnEl.textContent = orig;
      }, 1800);
    }
  }

  // ================= PASSAGE-TO-INFOGRAPHIC VISUAL SYNTHESIS =================
  generatePaperInfographic(customText = null) {
    if (!this.requireActivePaper("AI 인포그래픽 생성")) return;
    if (!window.infographicEngine) return;

    const sourceText =
      customText ||
      this.currentSelectionText ||
      this.currentPaper.abstractEn ||
      this.currentPaper.summaryText;

    const svgMarkup = window.infographicEngine.generateSVG(sourceText, this.currentPaper);

    window.researchDB?.logActivity({
      type: "infographic",
      paperId: this.currentPaper.id,
      paperTitle: this.currentPaper.title,
      quote: sourceText.slice(0, 120),
      detail: "3단계 시각 파이프라인 인포그래픽 다이어그램 생성"
    });

    const html = `
      <div class="space-y-4">
        <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3">
          <div class="text-xs text-emerald-700 dark:text-emerald-300">
            <strong>✨ 구절 기반 시각 인포그래픽 생성 완료:</strong> 선택한 논문 구절과 핵심 키워드를 분석해 발표·노트용 고화질 다이어그램으로 합성했습니다.
          </div>
          <button onclick="app.downloadCurrentInfographic()"
                  class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap shadow transition">
            🖼️ PNG 고화질 다운로드
          </button>
        </div>

        <div class="w-full overflow-x-auto">
          ${svgMarkup}
        </div>

        <div class="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
          <strong>원본 반영 구절:</strong> "${this.escapeHtml(sourceText.slice(0, 220))}${sourceText.length > 220 ? "..." : ""}"
          <div class="mt-1 text-[11px] text-indigo-500">💡 팁: 본문에서 원하는 문단을 드래그한 뒤 플로팅 바의 <strong>[인포그래픽]</strong>을 누르면 해당 문단 전용 다이어그램이 생성됩니다.</div>
        </div>
      </div>
    `;

    this.openUniversalModal(
      "AI Infographic Studio",
      `《${this.currentPaper.shortTitle || this.currentPaper.title}》 핵심 구조 인포그래픽`,
      html
    );
  }

  generateInfographicFromSelection() {
    const selected = this.currentSelectionText;
    this.hideSelectionToolbar();
    this.generatePaperInfographic(selected);
  }

  downloadCurrentInfographic() {
    const safeId = (this.currentPaper?.id || "paper").replace(/[^a-zA-Z0-9_-]/g, "_");
    window.infographicEngine?.downloadAsPng("generated-infographic-svg", `Infographic_${safeId}.png`);
  }

  // ================= LIVE ACADEMIC PAPER EXPLORE (OpenAlex 250M+ Works) =================
  openExploreModal(initialQuery = "") {
    const defaultQ =
      initialQuery ||
      this.currentPaper?.keywordsList?.[0] ||
      "";

    const quickTopics = [
      "Large Language Models",
      "Retrieval-Augmented Generation",
      "Computer Vision",
      "Reinforcement Learning",
      "Quantum Computing"
    ];

    const html = `
      <div class="space-y-4">
        <form onsubmit="app.executeExploreSearch(event)" class="flex items-center gap-2">
          <input id="explore-search-input" type="text" value="${this.escapeAttr(defaultQ)}"
                 placeholder="논문 제목, 연구 키워드, 저자명, DOI 입력 (OpenAlex 실시간 연동)..."
                 class="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-indigo-500" />
          <button type="submit" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold shrink-0 shadow transition">
            실시간 검색
          </button>
        </form>

        <div class="flex flex-wrap gap-1.5">
          ${quickTopics
            .map(
              (t) => `
            <button type="button" onclick="document.getElementById('explore-search-input').value='${this.escapeAttr(t)}'; app.executeExploreSearch(null);"
                    class="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-500/15 hover:text-indigo-400 text-[11px] font-medium transition">
              # ${this.escapeHtml(t)}
            </button>
          `
            )
            .join("")}
        </div>

        <div id="explore-results-container" class="space-y-3 min-h-[220px]">
          <div class="py-10 text-center text-xs text-zinc-400">찾고 싶은 논문 제목이나 연구 키워드를 입력해 검색하세요.</div>
        </div>
      </div>
    `;

    this.openUniversalModal("Live Paper Discovery", "글로벌 학술 논문 실시간 탐색 & 즉시 열람", html);
    if (defaultQ) {
      this.executeExploreSearch(null);
    } else {
      setTimeout(() => document.getElementById("explore-search-input")?.focus(), 50);
    }
  }

  async executeExploreSearch(event) {
    if (event) event.preventDefault();
    const input = document.getElementById("explore-search-input");
    const container = document.getElementById("explore-results-container");
    if (!input || !container || !window.scholarAPI) return;

    const query = input.value.trim();
    if (!query) return;

    container.innerHTML = `
      <div class="py-10 flex flex-col items-center justify-center gap-2 text-indigo-500 text-xs font-semibold">
        <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span>OpenAlex 학술 데이터베이스에서 '${this.escapeHtml(query)}' 문헌을 검색 중입니다...</span>
      </div>
    `;

    try {
      const works = await window.scholarAPI.searchPapers(query, 8);
      this.lastDiscoveredWorks = works;

      if (works.length === 0) {
        container.innerHTML = `<div class="py-8 text-center text-xs text-zinc-400">검색 결과가 없습니다. 다른 학술 키워드로 검색해 보세요.</div>`;
        return;
      }

      container.innerHTML = works
        .map(
          (w, idx) => `
          <div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/40 space-y-2 transition">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-bold text-[11px]">일치율 ${this.escapeHtml(w.matchRate)}</span>
                <span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[11px]">피인용 ${this.escapeHtml(w.citationCount)}회</span>
              </div>
              <span class="text-[11px] text-zinc-400">${this.escapeHtml(w.venue)} · ${w.year}</span>
            </div>

            <h4 class="font-bold text-sm text-zinc-900 dark:text-white leading-snug">${this.escapeHtml(w.title)}</h4>
            <p class="text-[11px] text-zinc-500">${this.escapeHtml(w.authorsStr)}</p>
            <p class="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">${this.escapeHtml(w.abstract.slice(0, 260))}${w.abstract.length > 260 ? "..." : ""}</p>

            <div class="pt-1.5 flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                ${
                  w.landingUrl
                    ? `<a href="${this.escapeAttr(w.landingUrl)}" target="_blank" rel="noopener noreferrer" class="text-[11px] text-zinc-400 hover:text-indigo-400 underline">원문 링크 ↗</a>`
                    : ""
                }
              </div>
              <div class="flex items-center gap-1.5">
                ${
                  w.pdfUrl
                    ? `<button onclick="app.loadRemotePdfUrl('${this.escapeAttr(w.pdfUrl)}', '${this.escapeAttr(w.title)}')"
                               class="px-2.5 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold transition">
                         📄 원문 PDF 로드
                       </button>`
                    : ""
                }
                <button onclick="app.openDiscoveredWork(${idx})"
                        class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">
                  📖 리더기로 바로 열기
                </button>
              </div>
            </div>
          </div>
        `
        )
        .join("");
    } catch (err) {
      container.innerHTML = `<div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">학술 API 연결 중 오류가 발생했습니다: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  async openDiscoveredWork(index) {
    const work = this.lastDiscoveredWorks?.[index];
    if (!work || !window.scholarAPI) return;

    let existing = this.papers.find((p) => p.id === work.id || p.title === work.title);
    if (!existing) {
      existing = window.scholarAPI.convertWorkToWorkspacePaper(work);
      this.papers.unshift(existing);
    }

    this.closeUniversalModal();
    await this.openPaper(existing.id);
    this.localizePaperInBackground(existing);
    this.refreshLiveRecommendations();
  }

  // ================= REMOTE arXiv / PDF URL LOADER =================
  async openUrlLoadPrompt() {
    await this.checkLocalProxyServer();
    const proxyBadge = this.proxyServerAvailable
      ? `<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">온라인 프록시 연결됨 (원격 PDF 직접 렌더링 가능)</span>`
      : `<span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold text-[11px]">클라이언트 브라우저 모드 (직접 업로드 즉시 지원)</span>`;

    const html = `
      <form onsubmit="app.submitUrlLoadModal(event)" class="space-y-4 text-xs">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span class="font-bold text-zinc-700 dark:text-zinc-200">arXiv 링크 / ID 또는 PDF 직접 URL 입력</span>
          ${proxyBadge}
        </div>

        <input id="remote-pdf-url-input" type="text" required
               placeholder="arXiv 논문 주소 또는 오픈액세스 PDF 링크를 입력하세요..."
               class="w-full rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-indigo-500" />

        <div class="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1 text-[11px] text-zinc-500 leading-relaxed">
          <div>• 프록시 연결 시 arXiv 및 오픈액세스 PDF 바이너리를 브라우저 보안 제약(CORS) 없이 직접 다운로드하여 캔버스에 렌더링합니다.</div>
          <div>• 로컬 파일 드래그 앤 드롭 및 파일 선택기를 통한 업로드는 추가 서버 없이도 브라우저에서 100% 즉시 동작합니다.</div>
        </div>

        <div class="flex justify-end gap-2">
          <button type="button" onclick="app.closeUniversalModal()" class="px-3.5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-medium">취소</button>
          <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow">논문 불러오기</button>
        </div>
      </form>
    `;

    this.openUniversalModal("URL / arXiv Loader", "외부 arXiv 논문 및 원격 PDF URL 열기", html);
  }

  async submitUrlLoadModal(event) {
    if (event) event.preventDefault();
    const rawInput = document.getElementById("remote-pdf-url-input")?.value.trim();
    if (!rawInput) return;
    await this.loadRemotePdfUrl(rawInput, rawInput);
  }

  async loadRemotePdfUrl(rawUrl, fallbackTitle = "") {
    let targetUrl = rawUrl.trim();
    if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(targetUrl)) {
      targetUrl = `https://arxiv.org/pdf/${targetUrl}.pdf`;
    } else if (targetUrl.includes("arxiv.org/abs/")) {
      const arxivId = targetUrl.split("arxiv.org/abs/")[1].split(/[?#]/)[0].replace(/\.pdf$/i, "");
      targetUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    }

    this.openUniversalModal(
      "원격 논문 로드 중",
      "원격 PDF 스트리밍 및 레이아웃 분석 중...",
      `<div class="py-8 flex flex-col items-center gap-2 text-indigo-500 text-xs font-semibold">
         <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
         <span>'${this.escapeHtml(targetUrl)}' 문서를 가져오고 있습니다...</span>
       </div>`
    );

    try {
      const fetchEndpoint = this.proxyServerAvailable
        ? `/api/proxy-pdf?url=${encodeURIComponent(targetUrl)}`
        : targetUrl;

      const res = await fetch(fetchEndpoint);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const fileName = (fallbackTitle || targetUrl.split("/").pop() || "remote_paper.pdf").replace(/[^a-zA-Z0-9가-힣._ -]/g, "_");
        this.closeUniversalModal();
        await this.processPdfArrayBuffer(
          fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
          arrayBuffer,
          true
        );
        return;
      }
    } catch (err) {
      console.warn("Direct/proxy binary fetch unavailable, falling back to OpenAlex resolver:", err);
    }

    try {
      const arxivMatch = targetUrl.match(/(\d{4}\.\d{4,5})/);
      const searchQ = arxivMatch ? arxivMatch[1] : fallbackTitle || targetUrl;
      const hits = await window.scholarAPI.searchPapers(searchQ, 1);
      if (hits.length > 0) {
        this.lastDiscoveredWorks = hits;
        await this.openDiscoveredWork(0);
        this.showFloatingCard(
          "🌐 학술 메타데이터 모드 열람 완료",
          `<p>원격 서버의 CORS 보안 정책으로 인해 학술 그래프 메타데이터 뷰로 열었습니다. 원본 PDF 캔버스까지 직접 스트리밍하려면 폴더의 <strong>start_server.bat</strong>을 실행해 주세요.</p>`
        );
        return;
      }
    } catch (_) {}

    this.closeUniversalModal();
    this.showFloatingCard(
      "⚠️ 원격 PDF 로드 안내",
      `<p>해당 URL은 외부 서버 CORS 정책에 의해 직접 다운로드가 제한됩니다. 파일을 PC에 저장 후 <strong>[PDF 업로드]</strong>를 누르시거나 <strong>start_server.bat</strong> 로컬 서버에서 실행해 주세요.</p>`
    );
  }

  // ================= LIVE RELATED PAPER RECOMMENDATIONS =================
  updateSidebarRelatedCardUI() {
    const matchEl = document.getElementById("rel-card-match");
    const labelEl = document.getElementById("rel-card-label");
    const titleEl = document.getElementById("rel-card-title");
    const descEl = document.getElementById("rel-card-desc");
    const moreEl = document.getElementById("rel-card-more");

    const top = this.relatedPapers?.[0];
    if (!top) {
      if (matchEl) matchEl.textContent = "대기 중";
      if (labelEl) labelEl.textContent = "맞춤 논문 추천";
      if (titleEl) titleEl.textContent = "열람 중인 논문이 없습니다";
      if (descEl) descEl.textContent = "논문을 열면 연관 학술 문헌을 추천합니다";
      if (moreEl) moreEl.textContent = "실시간 논문 탐색 열기";
      return;
    }

    if (matchEl) matchEl.textContent = `일치율 ${top.matchRate || "95%"}`;
    if (labelEl) labelEl.textContent = top.recommendLabel || "관련 연구 추천";
    if (titleEl) titleEl.textContent = top.title;
    if (descEl) descEl.textContent = top.aiRationale || top.aiReason || top.summary || top.abstract || "주제 연관 추천 논문";
    if (moreEl) moreEl.textContent = `외 ${Math.max(0, this.relatedPapers.length - 1)}편 더 보기`;
  }

  async refreshLiveRecommendations(event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper || !window.scholarAPI) {
      this.openExploreModal("");
      return;
    }

    const titleEl = document.getElementById("rel-card-title");
    const descEl = document.getElementById("rel-card-desc");
    const activeModelName = window.moonlightAI?.getModelDisplayName() || "주 AI 모델";
    if (titleEl) titleEl.textContent = `${activeModelName} 추천 분석 중...`;
    if (descEl) descEl.textContent = "현재 논문의 핵심 가설과 관련 문헌을 심층 분석하고 있습니다...";

    try {
      let recs = await window.scholarAPI.fetchRelatedRecommendations(this.currentPaper, 5);
      if (!recs || recs.length === 0) {
        recs = window.MOONLIGHT_RELATED_PAPERS || [];
      }
      if (window.moonlightAI && typeof window.moonlightAI.analyzeAndRankRelatedPapers === "function") {
        this.relatedPapers = await window.moonlightAI.analyzeAndRankRelatedPapers(this.currentPaper, recs);
      } else {
        this.relatedPapers = recs.map((r) => ({
          ...r,
          authors: r.authorsStr || (Array.isArray(r.authors) ? r.authors.join(", ") : r.authors || ""),
          summary: r.summary || (r.abstract ? r.abstract.slice(0, 200) + "..." : "")
        }));
      }
    } catch (err) {
      console.warn("refreshLiveRecommendations error fallback:", err);
      if (!this.relatedPapers || this.relatedPapers.length === 0) {
        this.relatedPapers = window.MOONLIGHT_RELATED_PAPERS || [];
      }
    } finally {
      this.updateSidebarRelatedCardUI();
    }
  }

  openRelatedPapersModal() {
    if (!this.relatedPapers || this.relatedPapers.length === 0) {
      this.openExploreModal("");
      return;
    }

    const activeModelName = window.moonlightAI?.getModelDisplayName() || "선택된 주 AI 모델";
    const headerBanner = `
      <div class="p-3 mb-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
        <span class="text-base shrink-0">✦</span>
        <span>주 AI 엔진 <strong>[${this.escapeHtml(activeModelName)}]</strong>이(가) 현재 열람 중인 논문의 핵심 방법론과 가설을 다각도로 분석하여 엄선한 추천 논문 목록입니다.</span>
      </div>
    `;

    const html = this.relatedPapers
      .map(
        (rp) => `
        <div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 font-bold text-xs">
              일치율 ${this.escapeHtml(rp.matchRate || "95%")} · ${this.escapeHtml(rp.recommendLabel || "추천")}
            </span>
            <span class="text-xs text-zinc-400">${this.escapeHtml(rp.venue || "학술지")} (${rp.year || ""})</span>
          </div>
          <h4 class="font-bold text-sm text-zinc-900 dark:text-white">${this.escapeHtml(rp.title)}</h4>
          <p class="text-xs text-zinc-500">${this.escapeHtml(Array.isArray(rp.authors) ? rp.authors.join(", ") : rp.authors)}</p>
          ${rp.aiRationale || rp.aiReason ? `<div class="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-900/20 text-xs text-indigo-700 dark:text-indigo-300 font-medium">💡 <strong>${this.escapeHtml(activeModelName)} 선정 근거:</strong> ${this.escapeHtml(rp.aiRationale || rp.aiReason)}</div>` : ""}
          <p class="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">${this.escapeHtml(rp.summary || rp.abstract || "")}</p>
          <div class="pt-1 flex justify-end gap-2">
            <button onclick="app.openExploreModal('${this.escapeAttr(rp.title)}')"
                    class="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold transition">
              🔍 원문 탐색
            </button>
            <button onclick="app.attachExtraReferencePaper('${this.escapeAttr(rp.title)}'); app.closeUniversalModal();"
                    class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition">
              + 토론 참고 논문으로 추가
            </button>
          </div>
        </div>
      `
      )
      .join("");

    this.openUniversalModal(
      "AI 관련 논문 추천",
      `${activeModelName} 맞춤 추천 문헌 (${this.relatedPapers.length}편)`,
      `<div>${headerBanner}<div class="space-y-3">${html}</div></div>`
    );
  }

  // ================= MY ACTIVITY CHRONOLOGICAL TIMELINE =================
  openMyActivityModal(filterType = "all") {
    this.activityFilter = filterType;
    const allActs = window.researchDB ? window.researchDB.getActivities(null) : [];
    const filtered =
      filterType === "all" ? allActs : allActs.filter((a) => a.type === filterType);

    const badgeInfo = {
      highlight: { label: "🖍️ 하이라이트·주석", cls: "bg-amber-500/15 text-amber-500" },
      ai_explain: { label: "💡 AI 설명·번역", cls: "bg-indigo-500/15 text-indigo-400" },
      ai_chat: { label: "💬 AI 토론 질의", cls: "bg-purple-500/15 text-purple-400" },
      capture: { label: "🎯 바운딩박스 캡처", cls: "bg-sky-500/15 text-sky-400" },
      infographic: { label: "📊 인포그래픽 생성", cls: "bg-emerald-500/15 text-emerald-400" }
    };

    const tabs = [
      { id: "all", name: "전체 활동" },
      { id: "highlight", name: "하이라이트·주석" },
      { id: "ai_explain", name: "AI 설명·번역" },
      { id: "capture", name: "영역 캡처" },
      { id: "infographic", name: "인포그래픽" }
    ];

    const tabsHtml = tabs
      .map(
        (t) => `
        <button onclick="app.openMyActivityModal('${t.id}')"
                class="px-3 py-1 rounded-full text-xs font-semibold transition ${
                  filterType === t.id
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }">
          ${t.name}
        </button>
      `
      )
      .join("");

    const listHtml =
      filtered.length > 0
        ? filtered
            .map((a) => {
              const meta = badgeInfo[a.type] || { label: "📌 연구 기록", cls: "bg-zinc-500/15 text-zinc-400" };
              return `
                <div class="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 rounded text-[11px] font-bold ${meta.cls}">${meta.label}</span>
                      <span class="text-[11px] text-zinc-400">${this.escapeHtml(a.timestamp || "")}</span>
                    </div>
                    <button onclick="app.removeActivityItem('${this.escapeAttr(a.id)}')" class="text-[11px] text-zinc-400 hover:text-rose-400">삭제</button>
                  </div>
                  <div onclick="app.openPaper('${this.escapeAttr(a.paperId)}'); app.closeUniversalModal();"
                       class="text-xs font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline truncate">
                    📄 ${this.escapeHtml(a.paperTitle || "")}
                  </div>
                  ${a.quote ? `<blockquote class="text-xs italic text-zinc-500 border-l-2 border-indigo-500/40 pl-2">"${this.escapeHtml(a.quote)}"</blockquote>` : ""}
                  ${a.detail ? `<p class="text-xs text-zinc-700 dark:text-zinc-300">${this.escapeHtml(a.detail)}</p>` : ""}
                </div>
              `;
            })
            .join("")
        : `<div class="py-10 text-center text-xs text-zinc-400">아직 기록된 활동이 없습니다. 논문을 열고 형광펜 마크업, 번역, 영역 캡처, 인포그래픽 생성을 실행하면 이곳에 자동 기록됩니다.</div>`;

    this.openUniversalModal(
      "My Activity",
      "내 독서 활동 타임라인",
      `<div class="space-y-4">
         <div class="flex flex-wrap gap-1.5">${tabsHtml}</div>
         <div class="space-y-2.5">${listHtml}</div>
       </div>`
    );
  }

  removeActivityItem(actId) {
    window.researchDB?.deleteActivity(actId);
    this.openMyActivityModal(this.activityFilter);
  }

  // ================= TOOLBAR & FLOATING WIDGET ACTIONS =================
  toggleAutoHighlights() {
    if (!this.requireActivePaper("오토 하이라이트")) return;
    this.autoHighlightsEnabled = !this.autoHighlightsEnabled;
    if (this.autoHighlightsEnabled) {
      this.ensurePaperAutoHighlights(this.currentPaper);
    }
    this.applyAutoHighlights();
    this.showToast(
      this.autoHighlightsEnabled
        ? `✨ 오토 하이라이트가 켜졌습니다 (${this.getPresetDisplayName()})`
        : "오토 하이라이트가 꺼졌습니다"
    );
  }

  ensurePaperAutoHighlights(paper) {
    if (!paper) return;
    if (Array.isArray(paper.autoHighlights) && paper.autoHighlights.length > 0) {
      return;
    }

    const highlights = [];
    let hlIdCounter = 1;

    // 1. Scan pageBlocksByPage (PDF layout blocks)
    if (paper.pageBlocksByPage && Object.keys(paper.pageBlocksByPage).length > 0) {
      for (const [pageNumStr, blocks] of Object.entries(paper.pageBlocksByPage)) {
        const pageNum = parseInt(pageNumStr, 10);
        let pageHlCount = 0;
        for (const blk of blocks) {
          if (blk.isHeading || !blk.en || blk.en.length < 32) continue;
          const text = blk.en.trim();

          let cat = null;
          if (/\b(propose|present|introduce|novel|develop|formulate|new framework|contribution|we design|our approach|first time|unique|presents|this paper|designed as)\b/i.test(text)) {
            cat = "novelty";
          } else if (/\b(result|show|shows|demonstrate|demonstrates|achieve|outperform|agreement|found|observed|indicate|conclude|accuracy|error|evaluation|compared|validates)\b/i.test(text)) {
            cat = "result";
          } else if (/\b(method|algorithm|experiment|experimental|measurement|setup|procedure|implementation|tunnel|velocimetry|particle|piv|frequency|vortex|cylinder|sensor|camera|laser|flow|water|naca)\b/i.test(text)) {
            cat = "methodology";
          }

          if (cat) {
            pageHlCount++;
            highlights.push({
              id: `autohl-${pageNum}-${hlIdCounter++}`,
              pageNum,
              category: cat,
              categoryLabel: cat === "novelty" ? "독창성" : cat === "methodology" ? "방법" : "결과",
              phrase: text,
              blockId: blk.id,
              leftPct: blk.leftPct,
              topPct: blk.topPct,
              widthPct: blk.widthPct,
              heightPct: blk.heightPct,
              aiNote: `AI가 담화 표지어 및 문맥을 분석하여 감지한 핵심 [${cat === "novelty" ? "독창성 / 기여" : cat === "methodology" ? "방법론" : "실험 결과"}] 문장입니다.`
            });
            if (pageHlCount >= 4) break;
          }
        }

        // If no keyword match on this page, pick a substantive sentence so the page has guidance
        if (pageHlCount === 0 && blocks.length > 0) {
          const candidate = blocks.find((b) => !b.isHeading && b.en && b.en.length >= 45);
          if (candidate) {
            highlights.push({
              id: `autohl-${pageNum}-${hlIdCounter++}`,
              pageNum,
              category: "methodology",
              categoryLabel: "방법",
              phrase: candidate.en.trim(),
              blockId: candidate.id,
              leftPct: candidate.leftPct,
              topPct: candidate.topPct,
              widthPct: candidate.widthPct,
              heightPct: candidate.heightPct,
              aiNote: "AI가 감지한 해당 페이지의 핵심 서술 문장입니다."
            });
          }
        }
      }
    }

    // 2. Scan structured sections for #paper-sheet view
    if (paper.sections && Array.isArray(paper.sections)) {
      paper.sections.forEach((sec) => {
        (sec.paragraphs || []).forEach((para) => {
          if (!Array.isArray(para.highlights)) para.highlights = [];
          if (para.highlights.length === 0 && para.en) {
            const sentences = para.en.split(/(?<=[.?!])\s+/);
            for (const s of sentences) {
              if (s.length < 35) continue;
              let cat = null;
              if (/\b(propose|present|introduce|novel|develop|formulate|contribution|our approach|unique|this paper|designed as)\b/i.test(s)) cat = "novelty";
              else if (/\b(result|show|demonstrate|achieve|outperform|agreement|found|observed|indicate)\b/i.test(s)) cat = "result";
              else if (/\b(method|algorithm|experiment|measurement|setup|procedure|implementation|tunnel|velocimetry)\b/i.test(s)) cat = "methodology";
              if (cat) {
                const hlObj = {
                  id: `autohl-sec-${hlIdCounter++}`,
                  category: cat,
                  categoryLabel: cat === "novelty" ? "독창성" : cat === "methodology" ? "방법" : "결과",
                  phrase: s.trim(),
                  aiNote: `AI 구조 분석 엔진이 감지한 핵심 [${cat === "novelty" ? "독창성" : cat === "methodology" ? "방법" : "결과"}] 문장입니다.`
                };
                para.highlights.push(hlObj);
                if (!highlights.some((h) => h.phrase === hlObj.phrase)) {
                  highlights.push({ ...hlObj, pageNum: sec.page || 1 });
                }
                break;
              }
            }
          }
        });
      });
    }

    paper.autoHighlights = highlights;
  }

  applyAutoHighlights() {
    // 1. Sync toolbar button UI
    const btn = document.getElementById("toolbar-btn-autohl");
    if (btn) {
      if (this.autoHighlightsEnabled) {
        btn.className =
          "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/35 transition shadow-xs";
      } else {
        btn.className =
          "px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent transition";
      }
    }

    if (!this.currentPaper) return;

    // 2. Render on PDF Canvas (#pdfjs-pages-wrapper)
    this.renderPdfAutoHighlightLayers();

    // 3. Render on Structured View (#paper-sheet)
    const sheet = document.getElementById("paper-sheet");
    if (sheet) {
      sheet.classList.remove("autohl-preset-basic", "autohl-preset-deep", "autohl-preset-stroke");
      if (this.autoHighlightsEnabled) {
        sheet.classList.remove("highlights-off");
        sheet.classList.add(`autohl-preset-${this.currentAutoHighlightPreset || "basic"}`);
      } else {
        sheet.classList.add("highlights-off");
      }
    }
  }

  renderPdfAutoHighlightLayers() {
    const pageContainers = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container");
    if (!pageContainers.length || !this.currentPaper) return;

    const paper = this.currentPaper;
    const preset = this.currentAutoHighlightPreset || "basic";

    pageContainers.forEach((container) => {
      const pageNum = parseInt(container.getAttribute("data-page-num") || "1", 10);
      
      // Clean existing autohl layer
      container.querySelector(".pdf-autohl-layer")?.remove();

      if (!this.autoHighlightsEnabled) return;

      const pageHls = (paper.autoHighlights || []).filter((h) => h.pageNum === pageNum);
      if (!pageHls.length) return;

      const layer = document.createElement("div");
      layer.className = "pdf-autohl-layer";

      pageHls.forEach((hl) => {
        const item = document.createElement("div");
        const presetClass = `autohl-${preset}-${hl.category}`;
        item.className = `pdf-autohl-item ${presetClass}`;
        item.style.left = `${hl.leftPct}%`;
        item.style.top = `${hl.topPct}%`;
        item.style.width = `${hl.widthPct}%`;
        item.style.height = `${Math.max(1.6, hl.heightPct)}%`;
        item.title = `[${hl.categoryLabel}] ${hl.phrase.slice(0, 90)}... (클릭하여 AI 해설 보기)`;

        item.onclick = (e) => {
          e.stopPropagation();
          this.inspectHighlight(hl.id, e);
        };

        layer.appendChild(item);
      });

      container.appendChild(layer);
    });
  }

  syncTranslationButtonsUI(statusText = null) {
    const topBtn = document.getElementById("toolbar-btn-layout-trans");
    const rightWidgetBtn = document.getElementById("page-trans-start-btn");

    if (topBtn) {
      if (this.layoutTranslationEnabled) {
        topBtn.className =
          "relative px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-[#5850ec] text-white transition shadow-sm";
      } else {
        topBtn.className =
          "relative px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition";
      }
      const labelSpan = topBtn.querySelector("span.whitespace-nowrap");
      if (labelSpan) {
        labelSpan.textContent =
          this.layoutTranslationEnabled && statusText
            ? statusText
            : "레이아웃 유지 번역";
      }
    }

    if (rightWidgetBtn) {
      if (this.pageTranslationEnabled) {
        rightWidgetBtn.textContent = statusText || "원문";
        rightWidgetBtn.className =
          "w-full py-1 rounded-lg bg-[#5850ec] hover:bg-indigo-500 text-white text-[11px] font-bold transition";
      } else {
        rightWidgetBtn.textContent = "시작";
        rightWidgetBtn.className =
          "w-full py-1 rounded-lg bg-zinc-900 dark:bg-zinc-950 hover:bg-indigo-600 dark:hover:bg-indigo-600 text-white text-[11px] font-bold transition";
      }
    }

    this.updatePageTransFontBarVisibility();
  }

  clearPdfTranslationLayers() {
    const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
    pdfWrapper?.classList.remove("split-page-trans-mode");
    document
      .querySelectorAll("#pdfjs-pages-wrapper .pdf-layout-trans-layer, #pdfjs-pages-wrapper .pdf-page-trans-card")
      .forEach((el) => el.remove());
  }

  /**
   * 1:1 Layout-Preserving Original PDF Translation (레이아웃 유지 번역)
   * Keeps the original PDF <canvas> (charts, figures, equations) intact and overlays 1:1 translated text blocks!
   */
  async toggleLayoutTranslation() {
    if (!this.requireActivePaper("레이아웃 유지 번역")) return;

    if (this.pageTranslationEnabled) {
      this.pageTranslationEnabled = false;
      this.clearPdfTranslationLayers();
    }

    this.layoutTranslationEnabled = !this.layoutTranslationEnabled;
    this.syncTranslationButtonsUI();

    if (!this.layoutTranslationEnabled) {
      this.clearPdfTranslationLayers();
      this.renderCurrentPaper();
      return;
    }

    await this.applyActiveLayoutTranslation();
  }

  async applyActiveLayoutTranslation() {
    if (!this.currentPaper || !window.moonlightAI) return;
    const paper = this.currentPaper;

    if (paper.isUploadedPdf && this.showingRawPdfCanvas) {
      const pageContainers = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container");
      const total = pageContainers.length;

      // Show immediate shimmer blocks on Page 1 while neural translation runs
      this.syncTranslationButtonsUI(`번역 중 (0/${total})`);
      for (let i = 0; i < total; i++) {
        if (!this.layoutTranslationEnabled || this.currentPaper !== paper) return;
        const pageNum = i + 1;
        await window.moonlightAI.translatePaperPage(paper, pageNum);
        if (!this.layoutTranslationEnabled || this.currentPaper !== paper) return;
        this.renderPdfLayoutOverlaysForPage(paper, pageNum, pageContainers[i]);
        this.syncTranslationButtonsUI(pageNum < total ? `번역 중 (${pageNum}/${total})` : null);
      }

      // Also translate title & abstract for structured view consistency
      const tl = window.moonlightAI.getTargetLanguageInfo().code;
      if (!paper.titleKo || paper.titleTranslatedLang !== tl) {
        paper.titleKo = await window.moonlightAI.translateText(paper.title, tl);
        paper.titleTranslatedLang = tl;
      }
      if (paper.abstractEn && (!paper.abstractKo || paper.abstractTranslatedLang !== tl)) {
        paper.abstractKo = await window.moonlightAI.translateText(paper.abstractEn, tl);
        paper.abstractTranslatedLang = tl;
      }
      window.researchDB?.updateUploadedPaperMeta(paper).catch(() => {});
      this.syncTranslationButtonsUI();
      return;
    }

    // Structured HTML sheet mode (#paper-sheet)
    this.syncTranslationButtonsUI("번역 중...");
    await window.moonlightAI.ensureFullPaperTranslated(paper, (done, total) => {
      if (this.layoutTranslationEnabled && this.currentPaper === paper) {
        this.syncTranslationButtonsUI(done < total ? `번역 중 (${done}/${total})` : null);
        this.renderCurrentPaper();
      }
    });
    this.syncTranslationButtonsUI();
    this.renderCurrentPaper();
  }

  renderPdfLayoutOverlaysForPage(paper, pageNum, pageContainerEl) {
    if (!pageContainerEl) return;
    pageContainerEl.querySelector(".pdf-layout-trans-layer")?.remove();

    const blocks = paper.pageBlocksByPage?.[pageNum] || [];
    if (blocks.length === 0) return;

    const layer = document.createElement("div");
    layer.className = "pdf-layout-trans-layer";

    for (const blk of blocks) {
      if (!blk.ko) continue;
      const div = document.createElement("div");
      div.className = "pdf-layout-trans-block";
      div.setAttribute("data-orig-en", blk.en);
      div.title = `원문: ${blk.en}`;

      div.style.left = `${blk.leftPct}%`;
      div.style.top = `${blk.topPct}%`;
      div.style.width = `${blk.widthPct}%`;
      div.style.minHeight = `${blk.heightPct}%`;

      // Calibrate font size so Korean/target translation fits cleanly inside the original English bounding box
      const baseFont = blk.fontPx || 12;
      const charRatio = blk.ko.length / Math.max(1, blk.en.length);
      let fittedPx = blk.isHeading ? baseFont * 0.92 : baseFont * 0.84;
      if (charRatio > 0.85 && !blk.isHeading) {
        fittedPx *= 0.92;
      }
      fittedPx = Math.max(9.5, Math.min(24, fittedPx));

      div.style.fontSize = `${fittedPx.toFixed(1)}px`;
      if (blk.isHeading) {
        div.style.fontWeight = "700";
      }
      div.textContent = blk.ko;
      layer.appendChild(div);
    }

    pageContainerEl.appendChild(layer);
  }

  /**
   * Side-by-Side Page Translation (우측 [페이지 번역 - 모든 페이지 - 시작])
   * Displays Original PDF page on the left + Clean Full-Page Translated Document on the right!
   */
  async togglePageTranslation() {
    if (!this.requireActivePaper("페이지 번역")) return;

    if (this.layoutTranslationEnabled) {
      this.layoutTranslationEnabled = false;
      this.clearPdfTranslationLayers();
    }

    this.pageTranslationEnabled = !this.pageTranslationEnabled;
    this.syncTranslationButtonsUI();

    if (!this.pageTranslationEnabled) {
      this.clearPdfTranslationLayers();
      this.renderCurrentPaper();
      return;
    }

    await this.applyActivePageTranslation();
  }

  async applyActivePageTranslation() {
    if (!this.currentPaper || !window.moonlightAI) return;
    const paper = this.currentPaper;
    const langInfo = window.moonlightAI.getTargetLanguageInfo();

    if (paper.isUploadedPdf && this.showingRawPdfCanvas) {
      const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
      pdfWrapper?.classList.add("split-page-trans-mode");

      const rows = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-row");
      const total = rows.length;

      // Insert placeholder translation cards immediately next to each page
      rows.forEach((row, idx) => {
        row.querySelector(".pdf-page-trans-card")?.remove();
        const pageContainer = row.querySelector(".pdf-page-container");
        const card = document.createElement("div");
        card.className = "pdf-page-trans-card page-trans-scalable-text";
        if (pageContainer?.style?.height) {
          card.style.minHeight = pageContainer.style.height;
        }
        card.innerHTML = `
          <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-4 text-xs font-sans">
            <span class="font-bold text-[#5850ec] dark:text-indigo-400">🌐 Page ${idx + 1} 번역 (${this.escapeHtml(langInfo.nativeName)})</span>
            <span class="text-zinc-400 animate-pulse">번역 생성 중...</span>
          </div>
          <div class="py-8 text-xs text-zinc-400 font-sans">⏳ ${idx + 1}페이지 원문을 ${this.escapeHtml(langInfo.nativeName)}로 번역하고 있습니다...</div>
        `;
        row.appendChild(card);
      });

      for (let i = 0; i < total; i++) {
        if (!this.pageTranslationEnabled || this.currentPaper !== paper) return;
        const pageNum = i + 1;
        this.syncTranslationButtonsUI(`${pageNum}/${total}`);
        await window.moonlightAI.translatePaperPage(paper, pageNum);
        if (!this.pageTranslationEnabled || this.currentPaper !== paper) return;
        this.populatePdfSideBySideCard(paper, pageNum, rows[i], langInfo);
      }

      window.researchDB?.updateUploadedPaperMeta(paper).catch(() => {});
      this.syncTranslationButtonsUI();
      return;
    }

    // Structured HTML sheet mode (#paper-sheet)
    this.renderCurrentPaper();
    await window.moonlightAI.ensureFullPaperTranslated(paper, (done, total) => {
      if (this.pageTranslationEnabled && this.currentPaper === paper) {
        this.syncTranslationButtonsUI(`${done}/${total}`);
        this.renderCurrentPaper();
      }
    });
    this.syncTranslationButtonsUI();
    this.renderCurrentPaper();
  }

  populatePdfSideBySideCard(paper, pageNum, rowEl, langInfo) {
    const card = rowEl?.querySelector(".pdf-page-trans-card");
    if (!card) return;

    const blocks = paper.pageBlocksByPage?.[pageNum] || [];
    const secFallback = (paper.sections || []).filter((s) => (s.page || 1) === pageNum);

    let bodyHtml = "";
    if (blocks.length > 0) {
      bodyHtml = blocks
        .map((blk) => {
          const text = this.escapeHtml(blk.ko || blk.en);
          if (blk.isHeading) {
            return `<h3 class="font-bold text-[1.12em] text-zinc-900 dark:text-white mt-5 mb-2 leading-snug">${text}</h3>`;
          }
          return `<p class="mb-3.5 text-justify text-zinc-800 dark:text-zinc-200">${text}</p>`;
        })
        .join("");
    } else if (secFallback.length > 0) {
      bodyHtml = secFallback
        .map(
          (s) =>
            `<h3 class="font-bold text-[1.12em] mb-2">${this.escapeHtml(s.titleKo || s.title)}</h3>` +
            (s.paragraphs || [])
              .map((p) => `<p class="mb-3.5 text-justify">${this.escapeHtml(p.ko || p.en)}</p>`)
              .join("")
        )
        .join("");
    } else {
      bodyHtml = `<p class="text-zinc-400 italic text-sm">이 페이지에는 추출 가능한 본문 텍스트가 없습니다 (도표/이미지 중심 페이지).</p>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-5 text-xs font-sans">
        <span class="font-bold text-[#5850ec] dark:text-indigo-400">🌐 Page ${pageNum} 원문 번역 · ${this.escapeHtml(langInfo.nativeName)}</span>
        <span class="text-[11px] text-zinc-400">${pageNum} / ${paper.totalPages || 1}</span>
      </div>
      <div class="space-y-1">
        ${bodyHtml}
      </div>
    `;
  }

  async handleOriginalPdfToggle() {
    if (!this.requireActivePaper("뷰어 모드 전환")) return;
    if (this.currentPaper.isUploadedPdf) {
      const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
      const sheetEl = document.getElementById("paper-sheet");
      const label = document.getElementById("original-pdf-pill-label");
      this.showingRawPdfCanvas = !this.showingRawPdfCanvas;
      if (this.showingRawPdfCanvas) {
        pdfWrapper?.classList.remove("hidden");
        sheetEl?.classList.add("hidden");
        if (label) label.textContent = "AI 구조화 뷰로 보기";
        if (this.layoutTranslationEnabled) await this.applyActiveLayoutTranslation();
        else if (this.pageTranslationEnabled) await this.applyActivePageTranslation();
      } else {
        pdfWrapper?.classList.add("hidden");
        sheetEl?.classList.remove("hidden");
        if (label) label.textContent = "원본 PDF로 보기";
        if (this.layoutTranslationEnabled) await this.applyActiveLayoutTranslation();
        else if (this.pageTranslationEnabled) await this.applyActivePageTranslation();
        else this.renderCurrentPaper();
      }
      if (this.autoHighlightsEnabled) {
        this.applyAutoHighlights();
      }
      return;
    }

    if (this.layoutTranslationEnabled) {
      await this.toggleLayoutTranslation();
    } else if (this.pageTranslationEnabled) {
      await this.togglePageTranslation();
    } else if (this.currentPaper.pdfUrl) {
      await this.loadRemotePdfUrl(this.currentPaper.pdfUrl, this.currentPaper.title);
    } else {
      this.showFloatingCard(
        "📄 학술 조판 뷰 안내",
        `<p>현재 학술 메타데이터 조판 뷰를 열람 중입니다. 직접 PDF 파일을 업로드하려면 좌측 <strong>[PDF 업로드]</strong>를 이용해 주세요.</p>`
      );
    }
  }

  saveCurrentToLibrary() {
    if (!this.requireActivePaper("라이브러리 저장")) return;
    this.currentPaper.savedInLibrary = !this.currentPaper.savedInLibrary;
    this.updateLibrarySaveStarUI();
    this.dismissLibraryToast();

    const msg = this.currentPaper.savedInLibrary
      ? `⭐ <strong>《${this.escapeHtml(this.currentPaper.title)}》</strong> 논문이 내 라이브러리에 저장되었습니다.`
      : `논문이 라이브러리 즐겨찾기에서 해제되었습니다.`;
    this.showFloatingCard("라이브러리 저장 알림", `<p>${msg}</p>`);
  }

  updateLibrarySaveStarUI() {
    const saved = Boolean(this.currentPaper?.savedInLibrary);
    const label = document.getElementById("expanded-star-label");
    if (label) {
      label.textContent = saved ? "라이브러리에 저장됨 ★" : "라이브러리에 저장";
    }
    const toast = document.getElementById("library-prompt-toast");
    if (toast) {
      if (!this.currentPaper || saved) toast.classList.add("hidden");
      else toast.classList.remove("hidden");
    }
  }

  dismissLibraryToast() {
    document.getElementById("library-prompt-toast")?.classList.add("hidden");
  }

  showToast(message, duration = 2800) {
    let toast = document.getElementById("moonlight-floating-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "moonlight-floating-toast";
      toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-zinc-900/95 dark:bg-white/95 text-white dark:text-zinc-900 text-xs font-semibold shadow-2xl backdrop-blur-md transition-all duration-300 pointer-events-none select-none flex items-center gap-2 opacity-0 translate-y-3";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("opacity-0", "translate-y-3");
    toast.classList.add("opacity-100", "translate-y-0");

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "translate-y-3");
    }, duration);
  }

  handleZoomSelect(val) {
    this.zoomLevel = Number(val) || 100;
    this.updateZoomSelectUI();
    this.applyPdfCanvasZoom();
    if (this.currentPaper && !this.showingRawPdfCanvas) this.renderCurrentPaper();
  }

  adjustZoom(delta) {
    this.zoomLevel = Math.min(250, Math.max(50, this.zoomLevel + delta));
    this.updateZoomSelectUI();
    this.applyPdfCanvasZoom();
    if (this.currentPaper && !this.showingRawPdfCanvas) this.renderCurrentPaper();
  }

  updateZoomSelectUI() {
    const sel = document.getElementById("zoom-select");
    if (!sel) return;
    const val = String(this.zoomLevel);
    let matched = false;
    for (const opt of sel.options) {
      if (opt.value === val) {
        sel.value = val;
        matched = true;
        break;
      }
    }
    if (!matched) {
      let customOpt = sel.querySelector("option[data-custom='true']");
      if (!customOpt) {
        customOpt = document.createElement("option");
        customOpt.setAttribute("data-custom", "true");
        sel.appendChild(customOpt);
      }
      customOpt.value = val;
      customOpt.textContent = `${val}%`;
      sel.value = val;
    }
  }

  applyPdfCanvasZoom() {
    // Clear legacy CSS zoom property that caused bitmap pixelation
    document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container").forEach((el) => {
      el.style.zoom = "";
    });
    this.reRenderPdfCanvasPages();
  }

  reRenderPdfCanvasPages() {
    if (!this.activePdfDoc && this.currentPaper?.isUploadedPdf && window.researchDB) {
      window.researchDB.getUploadedPdfBytes(this.currentPaper.id).then(async (storedBytes) => {
        if (storedBytes && window.pdfjsLib) {
          this.activePdfArrayBuffer = storedBytes;
          this.activePdfDoc = await window.pdfjsLib.getDocument({ data: storedBytes.slice(0) }).promise;
          this.reRenderPdfCanvasPages();
        }
      });
      return;
    }
    if (!this.activePdfDoc) return;
    const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
    if (!pdfWrapper) return;

    if (this._pdfZoomDebounceTimer) {
      clearTimeout(this._pdfZoomDebounceTimer);
    }

    const currentScale = (this.zoomLevel / 100) * 1.33;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Fast CSS resizing first so user gets instant responsive UI feedback
    const containers = pdfWrapper.querySelectorAll(".pdf-page-container");
    containers.forEach((container) => {
      const baseW = Number(container.getAttribute("data-base-width")) || 612;
      const baseH = Number(container.getAttribute("data-base-height")) || 792;
      const cssW = Math.round(baseW * currentScale);
      const cssH = Math.round(baseH * currentScale);
      container.style.width = `${cssW}px`;
      container.style.height = `${cssH}px`;
      const canvas = container.querySelector("canvas");
      if (canvas) {
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      const transCard = container.closest(".pdf-page-row")?.querySelector(".pdf-page-trans-card");
      if (transCard) {
        transCard.style.minHeight = `${cssH}px`;
      }
    });

    // Debounced high-DPI vector rendering to avoid worker collisions and render crisp text
    this._pdfZoomDebounceTimer = setTimeout(async () => {
      if (!this.activePdfDoc) return;
      const numPages = Math.min(this.activePdfDoc.numPages, 15);
      this.activeRenderTasks = this.activeRenderTasks || {};

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const container = pdfWrapper.querySelector(`.pdf-page-container[data-page-num="${pageNum}"]`);
        if (!container) continue;

        try {
          const page = await this.activePdfDoc.getPage(pageNum);
          const cssViewport = page.getViewport({ scale: currentScale });
          const renderViewport = page.getViewport({ scale: currentScale * dpr });

          const canvas = container.querySelector("canvas");
          if (!canvas) continue;

          // Cancel any ongoing render task on this page
          if (this.activeRenderTasks[pageNum]) {
            try { this.activeRenderTasks[pageNum].cancel(); } catch (e) {}
          }

          // Allocate sharp physical pixel buffer
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          canvas.style.width = `${Math.floor(cssViewport.width)}px`;
          canvas.style.height = `${Math.floor(cssViewport.height)}px`;
          container.style.width = `${Math.floor(cssViewport.width)}px`;
          container.style.height = `${Math.floor(cssViewport.height)}px`;

          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          const renderTask = page.render({
            canvasContext: ctx,
            viewport: renderViewport
          });
          this.activeRenderTasks[pageNum] = renderTask;
          await renderTask.promise;

          // Re-render text layer with matching cssViewport
          const textLayerDiv = container.querySelector(".pdf-text-layer, .textLayer");
          if (textLayerDiv && window.pdfjsLib?.renderTextLayer) {
            textLayerDiv.innerHTML = "";
            textLayerDiv.className = "textLayer pdf-text-layer";
            textLayerDiv.style.setProperty("--scale-factor", String(cssViewport.scale || 1));
            const textContent = await page.getTextContent();
            const textLayerTask = window.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: cssViewport,
              textDivs: []
            });
            if (textLayerTask?.promise) {
              await textLayerTask.promise;
            }
            this.filterWatermarkSpansFromSelection(textLayerDiv);
          }
        } catch (err) {
          if (err?.name === "RenderingCancelledException") {
            continue; // Normal cancellation during rapid zoom
          }
          console.warn(`Error re-rendering page ${pageNum}:`, err);
        } finally {
          delete this.activeRenderTasks[pageNum];
        }
      }

      // Re-apply highlight and translation overlays
      this.renderPdfAutoHighlightLayers();
      if (this.layoutTranslationEnabled && this.currentPaper) {
        containers.forEach((c) => {
          const pNum = parseInt(c.getAttribute("data-page-num") || "1", 10);
          this.renderPdfLayoutOverlaysForPage(this.currentPaper, pNum, c);
        });
      }
    }, 70);
  }

  stepPage(delta) {
    if (!this.currentPaper) return;
    const total = this.currentPaper.totalPages || 1;
    const current = Number(this.currentPage || document.getElementById("page-num-input")?.value || 1);
    const target = Math.max(1, Math.min(total, current + delta));
    const input = document.getElementById("page-num-input");
    if (input) input.value = String(target);
    this.jumpToPage(target);
  }

  jumpToPage(pageVal) {
    if (!this.currentPaper) return;
    const pNum = Number(pageVal) || 1;
    this.currentPage = pNum;
    const input = document.getElementById("page-num-input");
    if (input && document.activeElement !== input) {
      input.value = String(pNum);
    }

    if (this.currentPaper.isUploadedPdf && this.showingRawPdfCanvas) {
      const pages = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container");
      const target = pages[Math.max(0, Math.min(pages.length - 1, pNum - 1))];
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const secs = this.currentPaper.sections || [];
    const targetSec = secs.find((s) => (s.page || 1) >= pNum) || secs[secs.length - 1];
    if (targetSec) {
      document.getElementById(targetSec.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  setupPageScrollObserver() {
    const vp = document.getElementById("center-viewport");
    if (!vp) return;
    let ticking = false;
    vp.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!this.currentPaper) return;
        const pageInput = document.getElementById("page-num-input");
        if (!pageInput || document.activeElement === pageInput) return;

        if (this.currentPaper.isUploadedPdf && this.showingRawPdfCanvas) {
          const pages = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container");
          if (!pages.length) return;
          const vpRect = vp.getBoundingClientRect();
          let currentPg = 1;
          for (let i = 0; i < pages.length; i++) {
            const rect = pages[i].getBoundingClientRect();
            if (rect.top <= vpRect.top + 200 && rect.bottom >= vpRect.top + 50) {
              currentPg = i + 1;
              break;
            }
          }
          if (pageInput.value !== String(currentPg)) {
            pageInput.value = String(currentPg);
          }
        }
      });
    }, { passive: true });
  }

  // ================= HEADING SCAN, HIGHLIGHTS & SMART CITATION HANDLERS =================
  inspectPaperTitle(event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;
    const p = this.currentPaper;
    const md = `### 🎓 논문 전체 핵심 브리핑\n\n**제목:** ${p.title}\n\n**3줄 핵심 요약:**\n1. ${p.threeLineSummary?.[0] || ""}\n2. ${p.threeLineSummary?.[1] || ""}\n3. ${p.threeLineSummary?.[2] || ""}`;
    this.lastFloatingResult = { selectedText: p.title, resultMarkdown: md };
    this.showFloatingCard("✨ 논문 핵심 AI 브리핑", this.renderMarkdownWithMath(md));
  }

  inspectSectionHeading(secId, event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;
    const sec = (this.currentPaper.sections || []).find((s) => s.id === secId);
    if (!sec) return;

    const koTexts = (sec.paragraphs || []).map((p) => p.ko || p.en).join("\n\n");
    const md = `### 📑 섹션 핵심 해설: ${sec.titleKo || sec.title}\n\n**섹션 본문 내용:**\n${koTexts}`;
    this.lastFloatingResult = { selectedText: sec.title, resultMarkdown: md };
    this.showFloatingCard(`섹션 포커스 분석 (${sec.number}. ${sec.title})`, this.renderMarkdownWithMath(md));
  }

  inspectHighlight(hlId, event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;
    let foundHl = null;
    let foundPara = null;

    if (Array.isArray(this.currentPaper.autoHighlights)) {
      foundHl = this.currentPaper.autoHighlights.find((h) => h.id === hlId);
    }

    if (!foundHl) {
      for (const sec of this.currentPaper.sections || []) {
        for (const p of sec.paragraphs || []) {
          for (const h of p.highlights || []) {
            if (h.id === hlId) {
              foundHl = h;
              foundPara = p;
              break;
            }
          }
          if (foundHl) break;
        }
        if (foundHl) break;
      }
    }

    if (!foundHl) return;

    const catLabel = foundHl.categoryLabel || (foundHl.category === "novelty" ? "독창성" : foundHl.category === "methodology" ? "방법" : "결과");
    const md = `### ✨ 오토 하이라이트 해설 (${catLabel})\n\n> *"${foundHl.phrase}"*\n\n**🤖 AI 핵심 분석:**\n${foundHl.aiNote || "논문의 논증 구조에서 핵심적인 진술로 분석된 문장입니다."}\n\n**🌐 원문 맥락:**\n${foundPara?.ko || foundPara?.en || foundHl.phrase}`;
    this.lastFloatingResult = { selectedText: foundHl.phrase, resultMarkdown: md };
    this.showFloatingCard(`오토 하이라이트 (${catLabel})`, this.renderMarkdownWithMath(md));
  }

  inspectUserNote(noteId, event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;
    const list = this.userNotesByPaper[this.currentPaper.id] || [];
    const note = list.find((n) => n.id === noteId);
    if (!note) return;

    const colorBadgeMap = {
      yellow: "🟡 노랑 형광펜",
      purple: "🟣 보라 형광펜",
      green: "🟢 초록 형광펜"
    };

    const html = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-indigo-500">${colorBadgeMap[note.color || "yellow"]}</span>
          <button onclick="app.deleteUserNote('${this.escapeAttr(note.id)}')" class="text-xs text-rose-500 hover:underline font-semibold">하이라이트 삭제</button>
        </div>
        <blockquote class="italic border-l-2 border-amber-500 pl-2.5 text-xs text-zinc-600 dark:text-zinc-300">"${this.escapeHtml(note.phrase)}"</blockquote>
        <div class="flex items-center gap-2 pt-1">
          <input id="inline-hl-note-input" type="text" value="${this.escapeAttr(note.note)}"
                 placeholder="이 구절에 대한 나만의 주석/메모 입력..."
                 class="flex-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500" />
          <button onclick="app.updateUserNoteComment('${this.escapeAttr(note.id)}')"
                  class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
            주석 저장
          </button>
        </div>
      </div>
    `;
    this.showFloatingCard("🖍️ 내 마크업 하이라이트 & 주석", html);
  }

  updateUserNoteComment(noteId) {
    if (!this.currentPaper) return;
    const val = document.getElementById("inline-hl-note-input")?.value.trim() || "중요 체크 구절";
    const list = this.userNotesByPaper[this.currentPaper.id] || [];
    const target = list.find((n) => n.id === noteId);
    if (target) {
      target.note = val;
      localStorage.setItem(this.notesStorageKey, JSON.stringify(this.userNotesByPaper));
      window.researchDB?.logActivity({
        type: "highlight",
        paperId: this.currentPaper.id,
        paperTitle: this.currentPaper.title,
        quote: target.phrase.slice(0, 120),
        detail: `주석 메모: ${val}`
      });
      this.renderCurrentPaper();
      this.closeFloatingCard();
    }
  }

  deleteUserNote(noteId) {
    if (!this.currentPaper) return;
    const pid = this.currentPaper.id;
    this.userNotesByPaper[pid] = (this.userNotesByPaper[pid] || []).filter((n) => n.id !== noteId);
    localStorage.setItem(this.notesStorageKey, JSON.stringify(this.userNotesByPaper));
    this.renderCurrentPaper();
    this.closeFloatingCard();
  }

  async openCitationPreview(numStr, event) {
    if (event) event.stopPropagation();
    if (!this.currentPaper) return;
    const cit = (this.currentPaper.citations || []).find((c) => String(c.num) === String(numStr));

    if (!cit) {
      this.showFloatingCard(
        `📚 스마트 인용 조회 [${numStr}]`,
        `<p>참고문헌 [${this.escapeHtml(numStr)}] 메타데이터를 OpenAlex 학술 그래프에서 검색할 수 있습니다.</p>
         <button onclick="app.openExploreModal('${this.escapeAttr(this.currentPaper.title)}')" class="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">관련 인용 문헌 실시간 검색</button>`
      );
      return;
    }

    if (cit.authors === "PDF Bibliography Extracted" && window.scholarAPI) {
      this.showFloatingCard(
        `📚 스마트 인용 실시간 매칭 중 [${numStr}]`,
        `<div class="flex items-center gap-2 text-indigo-500 py-2">
           <div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
           <span>OpenAlex에서 참고문헌 [${this.escapeHtml(numStr)}]의 초록과 피인용 정보를 조회 중입니다...</span>
         </div>`
      );
      const enriched = await window.scholarAPI.resolveReferenceCitation(cit.abstract, numStr);
      Object.assign(cit, enriched);
    }

    const html = `
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
            참고문헌 [${this.escapeHtml(cit.num)}] · ${this.escapeHtml(cit.role)}
          </span>
          <span class="text-xs font-semibold text-amber-500">피인용 ${this.escapeHtml(cit.citations)}회</span>
        </div>
        <h4 class="font-bold text-sm sm:text-base text-zinc-900 dark:text-white">${this.escapeHtml(cit.title)}</h4>
        <p class="text-xs text-zinc-500">${this.escapeHtml(cit.authors)} · <strong>${this.escapeHtml(cit.venue)} ${cit.year ? `(${cit.year})` : ""}</strong></p>
        <div class="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs leading-relaxed">
          <strong>초록 요약:</strong> ${this.escapeHtml(cit.abstract)}
        </div>
        <div class="flex items-center justify-between pt-1 gap-2">
          <span class="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium truncate">🔗 ${this.escapeHtml(cit.relevance)}</span>
          <button onclick="app.attachExtraReferencePaper('${this.escapeAttr(cit.title)}'); app.closeFloatingCard();"
                  class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shrink-0">
            + 토론 참고 추가
          </button>
        </div>
      </div>
    `;
    this.showFloatingCard(`📚 스마트 인용 미리보기 [${cit.num}]`, html);
  }

  // ================= MODALS (Equations, Figures, Library, Citations, Paper Info) =================
  openUniversalModal(badgeText, titleText, bodyHtml) {
    const modal = document.getElementById("universal-modal");
    const badge = document.getElementById("umodal-badge");
    const title = document.getElementById("umodal-title");
    const body = document.getElementById("umodal-body");
    if (!modal || !badge || !title || !body) return;

    badge.textContent = badgeText;
    title.textContent = titleText;
    body.innerHTML = bodyHtml;
    modal.classList.remove("hidden");
    this.refreshIcons();
  }

  closeUniversalModal() {
    document.getElementById("universal-modal")?.classList.add("hidden");
  }

  openImageExplanationModal() {
    if (!this.requireActivePaper("도표 및 수식 설명")) return;
    const figs = this.currentPaper.figures || [];
    const eqs = this.currentPaper.equations || [];

    const figsHtml =
      figs.length > 0
        ? figs
            .map(
              (f) => `
          <div class="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold text-xs">${this.escapeHtml(f.label)}</span>
              <span class="text-xs font-semibold text-zinc-500">AI Vision Figure Analysis</span>
            </div>
            <h4 class="font-bold text-sm sm:text-base">${this.escapeHtml(f.title)}</h4>
            <div class="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs leading-relaxed">
              ${this.escapeHtml(f.aiInsight)}
            </div>
            <p class="text-[11px] text-zinc-500 italic">${this.escapeHtml(f.caption)}</p>
          </div>
        `
            )
            .join("")
        : `<p class="text-xs text-zinc-400">상단 <strong>[영역 캡처 설명]</strong> 버튼으로 논문 내 원하는 그림이나 표를 드래그하면 즉시 비전 분석을 수행합니다.</p>`;

    const eqsHtml =
      eqs.length > 0
        ? eqs
            .map(
              (e) => `
          <div onclick="app.openEquationModal('${this.escapeAttr(e.id)}')" class="cursor-pointer p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 space-y-2 transition">
            <div class="font-bold text-xs text-amber-600 dark:text-amber-400">📐 ${this.escapeHtml(e.label)}: ${this.escapeHtml(e.title)}</div>
            <div class="py-1 text-center overflow-x-auto">${this.renderLatexToString(e.latex, true)}</div>
            <p class="text-xs text-zinc-600 dark:text-zinc-300">${this.escapeHtml(e.summary)}</p>
          </div>
        `
            )
            .join("")
        : "";

    this.openUniversalModal(
      "이미지 & 수식 설명",
      `《${this.currentPaper.shortTitle || this.currentPaper.title}》 도표 및 수식 해설`,
      `<div class="space-y-4">
         <div class="flex justify-end">
           <button onclick="app.closeUniversalModal(); app.activateRegionCapture();" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
             🎯 마우스 드래그로 직접 영역 캡처하기
           </button>
         </div>
         ${figsHtml}
         ${eqsHtml}
       </div>`
    );
  }

  openEquationModal(eqId) {
    if (!this.currentPaper) return;
    const eq = (this.currentPaper.equations || []).find((e) => e.id === eqId);
    if (!eq) return;

    const formattedEqLatex = window.moonlightAI
      ? window.moonlightAI.formatLatexWithDelimiter(eq.latex, true)
      : eq.latex;
    const encodedLatex = encodeURIComponent(formattedEqLatex);
    const varsHtml = (eq.variables || [])
      .map(
        (v) => `
        <div class="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div class="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-mono text-xs shrink-0">
            ${this.renderLatexToString(v.symbol, false)}
          </div>
          <p class="text-xs leading-relaxed">${this.escapeHtml(v.meaning)}</p>
        </div>
      `
      )
      .join("");

    this.openUniversalModal(
      eq.label,
      eq.title,
      `<div class="space-y-4">
         <div class="p-5 rounded-xl bg-zinc-100 dark:bg-zinc-950 text-center text-base overflow-x-auto">
           ${this.renderLatexToString(eq.latex, true)}
         </div>
         <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900 text-emerald-300 font-mono text-[11px] gap-2">
           <span class="truncate">${this.escapeHtml(formattedEqLatex)}</span>
           <button onclick="app.copyCapturedLatex('${encodedLatex}', this)" class="px-2.5 py-1 rounded bg-indigo-600 text-white font-sans font-bold shrink-0">LaTeX 복사</button>
         </div>
         <div class="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs leading-relaxed">
           <strong>💡 수식 핵심 원리:</strong> ${this.escapeHtml(eq.summary)}
         </div>
         <div class="space-y-2">
           <h4 class="text-xs font-bold text-zinc-400 uppercase">기호 및 변수별 상세 의미</h4>
           ${varsHtml}
         </div>
       </div>`
    );
  }

  openFigureModal(figId) {
    this.openImageExplanationModal();
  }

  openLibraryModal() {
    this.openFullLibraryView("recent");
  }

  // ================= REFERENCE PAPERS ATTACHMENT POPOVER (Image 1) =================
  toggleRefPaperPopover(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById("popover-ref-paper");
    if (!popover) return;
    this.closeChatModelPopover();
    const isHidden = popover.classList.contains("hidden");
    if (isHidden) {
      popover.classList.remove("hidden");
      this.refPaperSearchKeyword = "";
      const searchInput = document.getElementById("ref-paper-search-input");
      if (searchInput) searchInput.value = "";
      this.renderRefPaperPopoverContent();
      setTimeout(() => searchInput?.focus(), 60);
    } else {
      popover.classList.add("hidden");
    }
  }

  closeRefPaperPopover() {
    document.getElementById("popover-ref-paper")?.classList.add("hidden");
  }

  setRefPaperTab(tab) {
    this.refPaperActiveTab = tab;
    const allBtn = document.getElementById("ref-tab-all");
    const folderBtn = document.getElementById("ref-tab-folder");
    if (tab === "all") {
      allBtn?.classList.add("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs", "font-semibold");
      allBtn?.classList.remove("text-zinc-500", "dark:text-zinc-400");
      folderBtn?.classList.remove("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs", "font-semibold");
      folderBtn?.classList.add("text-zinc-500", "dark:text-zinc-400");
    } else {
      folderBtn?.classList.add("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs", "font-semibold");
      folderBtn?.classList.remove("text-zinc-500", "dark:text-zinc-400");
      allBtn?.classList.remove("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs", "font-semibold");
      allBtn?.classList.add("text-zinc-500", "dark:text-zinc-400");
    }
    this.renderRefPaperPopoverContent();
  }

  filterRefPaperList(query) {
    this.refPaperSearchKeyword = (query || "").trim().toLowerCase();
    this.renderRefPaperPopoverContent();
  }

  renderRefPaperPopoverContent() {
    const body = document.getElementById("ref-paper-body");
    if (!body) return;

    const tab = this.refPaperActiveTab || "all";
    const kw = this.refPaperSearchKeyword || "";

    if (tab === "all") {
      let filtered = (this.papers || []).filter((p) => p && p.title);
      if (kw) {
        filtered = filtered.filter((p) => p.title.toLowerCase().includes(kw));
      }

      if (filtered.length === 0) {
        // Empty State (Image 1)
        body.innerHTML = `
          <div class="text-center py-6 space-y-1.5">
            <div class="w-10 h-10 mx-auto rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-1">
              <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </div>
            <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">논문을 찾을 수 없습니다</p>
            <div>
              <button type="button" onclick="app.closeRefPaperPopover(); app.openFullLibraryView('recent');"
                      class="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer">
                라이브러리에 논문을 추가해보세요
              </button>
            </div>
          </div>
        `;
        return;
      }

      let html = `<div class="space-y-1 py-1 max-h-[190px] overflow-y-auto">`;
      filtered.forEach((p) => {
        const isSelected = this.attachedExtraPapers.includes(p.title);
        html += `
          <div onclick="app.toggleRefPaperAttach('${this.escapeAttr(p.title)}')"
               class="px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between gap-2 transition ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'text-zinc-700 dark:text-zinc-200'}">
            <div class="flex items-center gap-2 min-w-0">
              <svg class="w-3.5 h-3.5 text-zinc-400 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              <span class="text-xs truncate font-medium">${this.escapeHtml(p.title)}</span>
            </div>
            <div class="w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}">
              ${isSelected ? `<svg class="w-3 h-3 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
            </div>
          </div>
        `;
      });
      html += `</div>`;
      body.innerHTML = html;
    } else {
      let folders = this.libraryFolders || [];
      if (kw) {
        folders = folders.filter((f) => f.name.toLowerCase().includes(kw));
      }

      if (folders.length === 0) {
        body.innerHTML = `
          <div class="text-center py-6 space-y-1.5">
            <div class="w-10 h-10 mx-auto rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-1">
              <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </div>
            <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">논문을 찾을 수 없습니다</p>
            <div>
              <button type="button" onclick="app.closeRefPaperPopover(); app.openFullLibraryView('library');"
                      class="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer">
                라이브러리에서 폴더 만들기
              </button>
            </div>
          </div>
        `;
        return;
      }

      let html = `<div class="space-y-1 py-1 max-h-[190px] overflow-y-auto">`;
      folders.forEach((f) => {
        html += `
          <div onclick="app.selectFolderRefPapers('${this.escapeAttr(f.id)}')"
               class="px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between text-zinc-700 dark:text-zinc-200 transition">
            <div class="flex items-center gap-2 truncate">
              <svg class="w-3.5 h-3.5 text-amber-500 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span class="text-xs font-medium truncate">${this.escapeHtml(f.name)}</span>
            </div>
            <span class="text-[10px] text-zinc-400 shrink-0">${(f.paperIds || []).length}편</span>
          </div>
        `;
      });
      html += `</div>`;
      body.innerHTML = html;
    }
  }

  toggleRefPaperAttach(title) {
    if (this.attachedExtraPapers.includes(title)) {
      this.attachedExtraPapers = this.attachedExtraPapers.filter((t) => t !== title);
    } else {
      this.attachedExtraPapers.push(title);
    }
    this.updateChatAttachmentBannerUI();
    this.renderRefPaperPopoverContent();
  }

  selectFolderRefPapers(folderId) {
    const folder = (this.libraryFolders || []).find((f) => f.id === folderId);
    if (!folder) return;
    const paperIds = folder.paperIds || [];
    const matchedTitles = (this.papers || [])
      .filter((p) => paperIds.includes(p.id))
      .map((p) => p.title);

    matchedTitles.forEach((t) => {
      if (!this.attachedExtraPapers.includes(t)) {
        this.attachedExtraPapers.push(t);
      }
    });

    this.updateChatAttachmentBannerUI();
    this.closeRefPaperPopover();
    this.showFloatingCard(
      `📁 [${folder.name}] 참고 논문 첨부`,
      `<p>해당 폴더의 논문 <strong>${matchedTitles.length}편</strong>이 AI 대화 맥락에 추가되었습니다.</p>`
    );
  }

  updateChatAttachmentBannerUI() {
    const banner = document.getElementById("chat-attachment-banner");
    const label = document.getElementById("chat-attachment-label");
    const refBtnLabel = document.getElementById("chat-ref-paper-label");

    if (this.attachedExtraPapers.length > 0) {
      if (refBtnLabel) refBtnLabel.textContent = `참고 논문 (${this.attachedExtraPapers.length})`;
      if (banner && label) {
        banner.classList.remove("hidden");
        label.textContent = `📎 참고 논문 (${this.attachedExtraPapers.length}편): ${this.attachedExtraPapers.slice(0, 2).join(", ")}${this.attachedExtraPapers.length > 2 ? ' 외' : ''}`;
      }
    } else {
      if (refBtnLabel) refBtnLabel.textContent = "참고 논문 추가";
      if (banner && !this.attachedContextQuote) {
        banner.classList.add("hidden");
      }
    }
  }

  // ================= AI MODEL SELECTOR POPOVER (Image 2) =================
  getAiModelCatalog() {
    return [
      // 1. Google Gemini
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", providerName: "Google Gemini", caption: "초고속 차세대 멀티모달 플래그십 (권장)" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", provider: "gemini", providerName: "Google Gemini", caption: "경량 초고속 연구 보조 엔진" },
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "gemini", providerName: "Google Gemini", caption: "심층 학술 분석 및 수식 추론" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", provider: "gemini", providerName: "Google Gemini", caption: "고성능 실시간 멀티모달" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", providerName: "Google Gemini", caption: "초고속 실시간 멀티모달 추론" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini", providerName: "Google Gemini", caption: "고성능 코딩 및 심층 학술 분석" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", providerName: "Google Gemini", caption: "차세대 멀티모달 종합 모델" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "gemini", providerName: "Google Gemini", caption: "200만 토큰 초대형 롱컨텍스트" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "gemini", providerName: "Google Gemini", caption: "경량 고속 표준 연구 모델" },

      // 2. OpenAI GPT
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", providerName: "OpenAI", caption: "옴니모달 플래그십 모델" },
      { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", providerName: "OpenAI", caption: "고속 경량 멀티모달 모델 (권장)" },
      { id: "o1", name: "o1", provider: "openai", providerName: "OpenAI", caption: "복잡한 과학/수학 심층 추론" },
      { id: "o1-mini", name: "o1-mini", provider: "openai", providerName: "OpenAI", caption: "STEM 분야 고속 추론" },
      { id: "o3-mini", name: "o3-mini", provider: "openai", providerName: "OpenAI", caption: "차세대 고속 과학/코딩 추론" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai", providerName: "OpenAI", caption: "고성능 비전 및 지식 처리" },

      // 3. Anthropic Claude
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", provider: "claude", providerName: "Anthropic Claude", caption: "사고 모드(Thinking) 하이브리드 추론" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "claude", providerName: "Anthropic Claude", caption: "최상위 학술 작문 및 심층 코딩 (권장)" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "claude", providerName: "Anthropic Claude", caption: "초고속 즉시 요약 및 응답" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: "claude", providerName: "Anthropic Claude", caption: "복잡한 텍스트 뉘앙스 심층 해석" }
    ];
  }

  getUserConfiguredApis() {
    const s = window.researchDB?.getAppSettings() || {};
    const geminiKey = localStorage.getItem("research_studio_gemini_key") || s.geminiApiKey || "";
    const openaiKey = localStorage.getItem("research_studio_openai_key") || s.openaiApiKey || "";
    const claudeKey = localStorage.getItem("research_studio_claude_key") || s.claudeApiKey || "";

    const isVerified = {
      gemini: window.moonlightAI ? window.moonlightAI.isProviderVerified("gemini") : false,
      openai: window.moonlightAI ? window.moonlightAI.isProviderVerified("openai") : false,
      claude: window.moonlightAI ? window.moonlightAI.isProviderVerified("claude") : false
    };

    return {
      gemini: isVerified.gemini,
      openai: isVerified.openai,
      claude: isVerified.claude,
      hasCustomKey: {
        gemini: Boolean(geminiKey && geminiKey.trim().length > 5),
        openai: Boolean(openaiKey && openaiKey.trim().length > 5),
        claude: Boolean(claudeKey && claudeKey.trim().length > 5)
      },
      keys: { gemini: geminiKey, openai: openaiKey, claude: claudeKey }
    };
  }

  toggleChatModelPopover(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById("popover-chat-model");
    if (!popover) return;
    this.closeRefPaperPopover();
    const isHidden = popover.classList.contains("hidden");
    if (isHidden) {
      popover.classList.remove("hidden");
      this.renderChatModelPopoverContent();
    } else {
      popover.classList.add("hidden");
    }
  }

  closeChatModelPopover() {
    document.getElementById("popover-chat-model")?.classList.add("hidden");
  }

  renderChatModelPopoverContent() {
    const listEl = document.getElementById("chat-model-list");
    if (!listEl) return;

    const catalog = this.getAiModelCatalog();
    const currentModelId = window.moonlightAI?.getActiveModel() || "gemini-2.5-flash";

    const groups = [
      { provider: "gemini", items: catalog.filter((m) => m.provider === "gemini") },
      { provider: "openai", items: catalog.filter((m) => m.provider === "openai") },
      { provider: "claude", items: catalog.filter((m) => m.provider === "claude") }
    ];

    let html = "";
    groups.forEach((group, gIdx) => {
      if (gIdx > 0) {
        html += `<div class="my-1.5 border-t border-zinc-100 dark:border-zinc-800/80"></div>`;
      }
      group.items.forEach((model) => {
        const isSelected = model.id === currentModelId;
        const isAvailable = window.moonlightAI
          ? window.moonlightAI.isProviderVerified(model.provider)
          : false;

        const textColor = isAvailable
          ? "text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
          : "text-zinc-400 dark:text-zinc-500 font-normal hover:bg-zinc-50 dark:hover:bg-zinc-800/40 opacity-75";

        html += `
          <div onclick="app.selectAiModel('${model.id}', ${isAvailable})"
               class="px-3 py-1.5 rounded-xl cursor-pointer flex flex-col justify-center transition select-none ${textColor}">
            <div class="flex items-center justify-between">
              <span class="text-[13px] leading-tight flex items-center gap-1.5">
                <span>${this.escapeHtml(model.name)}</span>
                ${!isAvailable ? '<span class="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">인증 필요</span>' : ''}
              </span>
              ${isSelected ? `
                <svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-current fill-none stroke-2 shrink-0 ml-2" viewBox="0 0 24 24">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ` : ''}
            </div>
            ${model.caption ? `
              <p class="text-[10.5px] text-zinc-400 dark:text-zinc-500 leading-tight mt-1">
                ${this.escapeHtml(model.caption)}
              </p>
            ` : ''}
          </div>
        `;
      });
    });

    listEl.innerHTML = html;
  }

  selectAiModel(modelId, isAvailable = true) {
    const catalog = this.getAiModelCatalog();
    const model = catalog.find((m) => m.id === modelId);
    if (!model) return;

    const isVerified = window.moonlightAI ? window.moonlightAI.isProviderVerified(model.provider) : false;

    if (!isVerified) {
      this.closeChatModelPopover();
      this.openSettingsModal("general");
      setTimeout(() => {
        const details = document.getElementById("details-api-keys");
        if (details) details.open = true;
        const targetInputId = `modal-${model.provider}-key`;
        document.getElementById(targetInputId)?.focus();
      }, 200);
      this.showFloatingCard(
        `🔑 ${model.providerName} API 키 인증 필요`,
        `<p>선택하신 <strong>${this.escapeHtml(model.name)}</strong> 모델을 활성화하려면 [설정]에서 ${model.providerName} API 키를 등록하고 유효성을 검증해주세요.</p>`
      );
      return;
    }

    window.moonlightAI?.setConfig(window.moonlightAI.apiKey, modelId);
    window.researchDB?.saveAppSettings({ aiModel: modelId });
    this.updateModelPillUI();
    this.closeChatModelPopover();
    this.generateModelRecommendedQuestions(true);
    this.showFloatingCard(
      `✦ 주 AI 모델 전환: ${model.name}`,
      `<p>웹페이지 전반적인 기능(번역, 관련 논문 추천, 질문 의도 분석 등)을 <strong>${this.escapeHtml(model.name)}</strong> 모델이 전담하여 수행합니다.</p>`
    );
  }

  // ================= MOONLIGHT FULL-SCREEN LIBRARY (Image 3) =================
  openFullLibraryView(initialTab = "recent") {
    this.closeRefPaperPopover();
    this.closeChatModelPopover();
    this.applyBrandConfigUI();
    const win = document.getElementById("moonlight-library-window");
    if (!win) return;
    win.classList.remove("hidden");
    this.switchLibraryTab(initialTab);
    this.renderLibraryFolderTree();
  }

  closeFullLibraryView() {
    document.getElementById("moonlight-library-window")?.classList.add("hidden");
  }

  toggleLibrarySidebar() {
    const sidebar = document.getElementById("library-left-sidebar");
    sidebar?.classList.toggle("hidden");
  }

  setLibraryLayoutMode(mode) {
    this.libraryLayoutMode = mode;
    const listBtn = document.getElementById("lib-view-list-btn");
    const gridBtn = document.getElementById("lib-view-grid-btn");
    if (mode === "list") {
      listBtn?.classList.add("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs");
      gridBtn?.classList.remove("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs");
    } else {
      gridBtn?.classList.add("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs");
      listBtn?.classList.remove("bg-white", "dark:bg-zinc-700", "text-zinc-900", "dark:text-white", "shadow-xs");
    }
    this.renderFullLibraryViewContent();
  }

  toggleLibrarySort() {
    const modes = ["recent", "title", "rating"];
    const idx = modes.indexOf(this.librarySortMode || "recent");
    this.librarySortMode = modes[(idx + 1) % modes.length];
    const labels = { recent: "최신순", title: "제목순", rating: "레이팅순" };
    this.showToast(`정렬: ${labels[this.librarySortMode]}`, 1500);
    this.renderFullLibraryViewContent();
  }

  filterLibraryTable(val) {
    this.renderFullLibraryViewContent();
  }

  switchLibraryTab(tab) {
    this.libraryActiveTab = tab;
    const titleEl = document.getElementById("lib-view-title");
    const recentBtn = document.getElementById("lib-nav-recent");
    const searchBtn = document.getElementById("lib-nav-search");
    const foldersBtn = document.getElementById("lib-nav-folders");

    [recentBtn, searchBtn, foldersBtn].forEach((b) => {
      b?.classList.remove("bg-zinc-200/80", "dark:bg-zinc-800", "font-semibold", "text-zinc-900", "dark:text-white");
      b?.classList.add("text-zinc-600", "dark:text-zinc-400");
    });

    if (tab === "recent" || tab === "all") {
      recentBtn?.classList.add("bg-zinc-200/80", "dark:bg-zinc-800", "font-semibold", "text-zinc-900", "dark:text-white");
      if (titleEl) titleEl.textContent = "최근 열어본 논문";
    } else if (tab === "search") {
      searchBtn?.classList.add("bg-zinc-200/80", "dark:bg-zinc-800", "font-semibold", "text-zinc-900", "dark:text-white");
      if (titleEl) titleEl.textContent = "라이브러리 검색";
      document.getElementById("lib-main-search")?.focus();
    } else if (tab === "library" || tab === "folder") {
      foldersBtn?.classList.add("bg-zinc-200/80", "dark:bg-zinc-800", "font-semibold", "text-zinc-900", "dark:text-white");
      if (titleEl) titleEl.textContent = "내 라이브러리 폴더";
    } else if (tab === "trash") {
      if (titleEl) titleEl.textContent = "휴지통";
    }

    this.renderFullLibraryViewContent();
  }

  renderFullLibraryViewContent() {
    const tbody = document.getElementById("lib-table-body");
    if (!tbody) return;

    let papers = [...(this.papers || [])];
    const kw = (document.getElementById("lib-main-search")?.value || "").trim().toLowerCase();
    if (kw) {
      papers = papers.filter((p) => p.title?.toLowerCase().includes(kw));
    }

    if (this.librarySortMode === "title") {
      papers.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (this.librarySortMode === "rating") {
      papers.sort((a, b) => (this.paperRatings[b.id] || 0) - (this.paperRatings[a.id] || 0));
    }

    if (papers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-16 text-center text-zinc-400 dark:text-zinc-500 text-xs">
            <p class="font-medium text-sm text-zinc-700 dark:text-zinc-300 mb-1">등록된 논문이 없습니다</p>
            <p>상단의 [논문 업로드] 버튼을 눌러 새 논문을 라이브러리에 보관해보세요.</p>
          </td>
        </tr>
      `;
      return;
    }

    let html = "";
    papers.forEach((p) => {
      const isPdf = Boolean(p.isUploadedPdf);
      const rating = this.paperRatings[p.id] || 0;
      const dateStr = p.lastAccessedDate || "2026. 11. 8.";

      let starsHtml = "";
      for (let star = 1; star <= 5; star++) {
        const isFilled = star <= rating;
        starsHtml += `
          <button type="button" onclick="event.stopPropagation(); app.setPaperRating('${p.id}', ${star})"
                  class="text-sm cursor-pointer hover:scale-125 transition ${isFilled ? 'text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}">
            ★
          </button>
        `;
      }

      html += `
        <tr onclick="app.openPaperFromLibrary('${p.id}')"
            class="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition select-none group">
          <td class="py-3 pr-4 flex items-center gap-2.5 max-w-[420px]">
            ${isPdf ? `
              <svg class="w-4 h-4 text-zinc-400 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            ` : `
              <svg class="w-4 h-4 text-zinc-400 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            `}
            <span class="truncate font-normal text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
              ${this.escapeHtml(p.title || "(No title)")}
            </span>
          </td>
          <td class="py-3 px-1 w-36 whitespace-nowrap">
            <div class="flex items-center gap-0.5">${starsHtml}</div>
          </td>
          <td class="py-3 px-1 w-24 text-zinc-400"><span class="hover:text-zinc-700 dark:hover:text-zinc-200">-</span></td>
          <td class="py-3 px-1 w-28 text-zinc-400"><span>-</span></td>
          <td class="py-3 pl-1 pr-4 w-32 whitespace-nowrap text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">${this.escapeHtml(dateStr)}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  setPaperRating(paperId, rating) {
    if (this.paperRatings[paperId] === rating) {
      this.paperRatings[paperId] = 0;
    } else {
      this.paperRatings[paperId] = rating;
    }
    localStorage.setItem("moonlight_paper_ratings", JSON.stringify(this.paperRatings));
    this.renderFullLibraryViewContent();
  }

  openPaperFromLibrary(paperId) {
    this.closeFullLibraryView();
    this.openPaper(paperId);
  }

  promptCreateLibraryFolder() {
    const name = window.prompt("새로 만들 라이브러리 폴더 이름을 입력하세요:", "유체역학");
    if (!name || !name.trim()) return;
    const folderName = name.trim();
    this.libraryFolders = this.libraryFolders || [];
    this.libraryFolders.push({
      id: `folder-${Date.now()}`,
      name: folderName,
      paperIds: []
    });
    localStorage.setItem("moonlight_library_folders", JSON.stringify(this.libraryFolders));
    this.renderLibraryFolderTree();
    this.renderRefPaperPopoverContent();
    this.showFloatingCard("📁 새 폴더 생성", `<p><strong>${this.escapeHtml(folderName)}</strong> 폴더가 라이브러리에 생성되었습니다.</p>`);
  }

  renderLibraryFolderTree() {
    const tree = document.getElementById("lib-folder-tree");
    if (!tree) return;
    const folders = this.libraryFolders || [];
    if (folders.length === 0) {
      tree.innerHTML = "";
      return;
    }
    let html = "";
    folders.forEach((f) => {
      html += `
        <div class="flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer group">
          <span class="truncate">📁 ${this.escapeHtml(f.name)}</span>
          <span class="text-[10px] text-zinc-400">${(f.paperIds || []).length}</span>
        </div>
      `;
    });
    tree.innerHTML = html;
  }

  updateProviderBadgeUI(provider, isVerified, hasKey) {
    const badge = document.getElementById(`modal-${provider}-status`);
    if (!badge) return;

    const names = { gemini: "Gemini", openai: "GPT", claude: "Claude" };
    const pName = names[provider] || provider;

    if (isVerified) {
      badge.textContent = `${pName} 모델군 활성화`;
      badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
    } else if (hasKey) {
      badge.textContent = "인증 실패 (키 확인 필요)";
      badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20";
    } else {
      badge.textContent = "인증 필요 (키 미입력)";
      badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border border-zinc-300 dark:border-zinc-700";
    }
  }

  syncAiModelSelectOptgroups(verifiedStatus = null) {
    const modelSelect = document.getElementById("set-ai-model-select");
    if (!modelSelect) return;

    const vStatus = verifiedStatus || (window.researchDB ? window.researchDB.getAppSettings().verifiedApis : { gemini: false, openai: false, claude: false }) || { gemini: false, openai: false, claude: false };

    const groups = [
      { id: "optgroup-gemini", provider: "gemini", baseLabel: "Google Gemini (플래그십)" },
      { id: "optgroup-openai", provider: "openai", baseLabel: "OpenAI (GPT 모델군)" },
      { id: "optgroup-claude", provider: "claude", baseLabel: "Anthropic Claude (심층 추론)" }
    ];

    groups.forEach((g) => {
      const optgroup = document.getElementById(g.id);
      const isVerified = !!vStatus[g.provider];
      if (optgroup) {
        optgroup.label = isVerified ? `${g.baseLabel} ✓ 활성화` : `${g.baseLabel} (미인증 - 키 검증 필요)`;
        const options = optgroup.querySelectorAll("option");
        options.forEach((opt) => {
          opt.disabled = !isVerified;
          let text = opt.textContent.replace(" (인증 필요)", "");
          if (!isVerified) {
            opt.textContent = `${text} (인증 필요)`;
          } else {
            opt.textContent = text;
          }
        });
      }
    });
  }

  autoSaveApiKey(provider, value) {
    const val = (value || "").trim();
    if (provider === "gemini") {
      if (val) localStorage.setItem("research_studio_gemini_key", val);
      else localStorage.removeItem("research_studio_gemini_key");
      window.researchDB?.saveAppSettings({ geminiApiKey: val });
    } else if (provider === "openai") {
      if (val) localStorage.setItem("research_studio_openai_key", val);
      else localStorage.removeItem("research_studio_openai_key");
      window.researchDB?.saveAppSettings({ openaiApiKey: val });
    } else if (provider === "claude") {
      if (val) localStorage.setItem("research_studio_claude_key", val);
      else localStorage.removeItem("research_studio_claude_key");
      window.researchDB?.saveAppSettings({ claudeApiKey: val });
    }

    clearTimeout(this._apiKeyDebounceTimer);
    if (val.length >= 20) {
      this._apiKeyDebounceTimer = setTimeout(() => {
        this.saveAllApiSettings();
      }, 1500);
    }
  }

  async saveAllApiSettings() {
    const geminiVal = document.getElementById("modal-gemini-key")?.value?.trim() || "";
    const openaiVal = document.getElementById("modal-openai-key")?.value?.trim() || "";
    const claudeVal = document.getElementById("modal-claude-key")?.value?.trim() || "";
    const modelSelect = document.getElementById("set-ai-model-select");
    const saveBtn = document.getElementById("btn-save-all-api");
    const statusMsg = document.getElementById("modal-api-status-msg");

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        API 키 가용성 검증 중...
      `;
    }

    if (statusMsg) {
      statusMsg.className = "text-[11px] text-indigo-500 font-medium animate-pulse";
      statusMsg.textContent = "AI 제공자 서버(Gemini, OpenAI, Claude)와 직접 통신하여 API 가용성을 실시간 검증하고 있습니다...";
    }

    ["gemini", "openai", "claude"].forEach((p) => {
      const b = document.getElementById(`modal-${p}-status`);
      if (b) {
        b.textContent = "검증 중...";
        b.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20 animate-pulse";
      }
    });

    try {
      const verificationResults = await (window.moonlightAI?.verifyAllApiKeys
        ? window.moonlightAI.verifyAllApiKeys({ gemini: geminiVal, openai: openaiVal, claude: claudeVal })
        : Promise.resolve({
            gemini: !!geminiVal,
            openai: !!openaiVal,
            claude: !!claudeVal
          }));

      if (geminiVal) localStorage.setItem("research_studio_gemini_key", geminiVal);
      else localStorage.removeItem("research_studio_gemini_key");

      if (openaiVal) localStorage.setItem("research_studio_openai_key", openaiVal);
      else localStorage.removeItem("research_studio_openai_key");

      if (claudeVal) localStorage.setItem("research_studio_claude_key", claudeVal);
      else localStorage.removeItem("research_studio_claude_key");

      localStorage.removeItem("research_studio_deepseek_key");

      this.updateProviderBadgeUI("gemini", verificationResults.gemini, !!geminiVal);
      this.updateProviderBadgeUI("openai", verificationResults.openai, !!openaiVal);
      this.updateProviderBadgeUI("claude", verificationResults.claude, !!claudeVal);
      this.syncAiModelSelectOptgroups(verificationResults);

      let currentRequestedModel = modelSelect?.value || window.moonlightAI?.getActiveModel() || "gemini-3.8-flash";
      let activeProvider = window.moonlightAI?.getModelProvider(currentRequestedModel) || "gemini";

      if (!verificationResults[activeProvider]) {
        if (verificationResults.gemini) {
          currentRequestedModel = "gemini-3.8-flash";
        } else if (verificationResults.openai) {
          currentRequestedModel = "gpt-4o";
        } else if (verificationResults.claude) {
          currentRequestedModel = "claude-3-5-sonnet-20241022";
        } else {
          currentRequestedModel = "gemini-3.8-flash";
        }
      }

      if (modelSelect) {
        modelSelect.value = currentRequestedModel;
      }

      window.researchDB?.saveAppSettings({
        geminiApiKey: geminiVal,
        openaiApiKey: openaiVal,
        claudeApiKey: claudeVal,
        deepseekApiKey: "",
        aiModel: currentRequestedModel,
        verifiedApis: verificationResults
      });

      window.moonlightAI?.setConfig(geminiVal, currentRequestedModel);
      this.updateModelPillUI();
      this.renderChatModelPopoverContent();
      this.generateModelRecommendedQuestions(true);

      const verifiedList = [];
      if (verificationResults.gemini) verifiedList.push("Gemini");
      if (verificationResults.openai) verifiedList.push("GPT (OpenAI)");
      if (verificationResults.claude) verifiedList.push("Claude");

      if (statusMsg) {
        if (verifiedList.length > 0) {
          statusMsg.className = "text-[11px] text-emerald-600 dark:text-emerald-400 font-medium";
          statusMsg.textContent = `✓ ${verifiedList.join(", ")} 모델군이 성공적으로 인증되어 활성화되었습니다.`;
        } else {
          statusMsg.className = "text-[11px] text-zinc-500 font-medium";
          statusMsg.textContent = "가용 가능한 API 키가 등록되지 않았습니다. 올바른 키를 입력 후 저장해 주세요.";
        }
      }

      const activeModelName = window.moonlightAI?.getModelDisplayName(currentRequestedModel) || currentRequestedModel;

      if (verifiedList.length > 0) {
        this.showFloatingCard(
          "🔑 AI 모델 활성화 및 설정 저장 완료",
          `<p>API 키가 검증되어 <strong>${verifiedList.join(", ")}</strong> 모델군이 활성화되었습니다.<br/>웹페이지 전반(번역, 추천, 분석, 질문 의도 파악)을 담당할 주 모델: <strong>${this.escapeHtml(activeModelName)}</strong></p>`
        );
      } else {
        this.showFloatingCard(
          "⚠️ API 키 미인증 상태",
          `<p>가용 가능한 API 키가 검증되지 않아 모델들이 비활성화 상태입니다. 올바른 API 인증키를 입력하고 [API 키 모두 저장]을 눌러주세요.</p>`
        );
      }
    } catch (err) {
      console.error("API verification error:", err);
      if (statusMsg) {
        statusMsg.className = "text-[11px] text-rose-500 font-medium";
        statusMsg.textContent = "API 키 검증 중 오류가 발생했습니다. 네트워크 연결 상태를 확인해 주세요.";
      }
      this.showFloatingCard("❌ API 검증 오류", `<p>${this.escapeHtml(err.message || "API 키 검증에 실패했습니다.")}</p>`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          API 키 모두 저장
        `;
      }
    }
  }

  openCitationsModal() {
    if (!this.requireActivePaper("스마트 인용 목록")) return;
    const cits = this.currentPaper.citations || [];
    const html =
      cits
        .map(
          (c) => `
        <div class="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-bold text-indigo-500 text-xs">[${this.escapeHtml(c.num)}] ${this.escapeHtml(c.role)}</span>
            <span class="text-xs text-amber-500 font-semibold">피인용 ${this.escapeHtml(c.citations)}</span>
          </div>
          <div class="font-bold text-sm">${this.escapeHtml(c.title)}</div>
          <div class="text-xs text-zinc-500">${this.escapeHtml(c.authors)} ${c.year ? `(${c.year})` : ""}</div>
          <p class="text-xs text-zinc-600 dark:text-zinc-300">${this.escapeHtml(c.abstract)}</p>
        </div>
      `
        )
        .join("") || `<p class="text-xs text-zinc-400">추출된 참고문헌 목록이 없습니다.</p>`;

    this.openUniversalModal("스마트 인용", "본문 인용 참고문헌 목록", `<div class="space-y-3">${html}</div>`);
  }

  // ================= MOONLIGHT PAPER INFO POPOVER (서지 정보 · 인용 · 읽을 가치) =================
  togglePaperInfoPopover(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById("paper-info-popover");
    const btn = document.getElementById("toolbar-btn-info");
    if (!popover) return;

    if (!popover.classList.contains("hidden")) {
      this.closePaperInfoPopover();
      return;
    }

    if (!this.requireActivePaper("문서 서지 정보")) return;
    this.renderPaperInfoContent();

    popover.classList.remove("hidden");
    if (btn) {
      btn.className = "p-1.5 rounded-lg border-[1.5px] border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white transition";
    }
    this.refreshIcons();
  }

  closePaperInfoPopover() {
    const popover = document.getElementById("paper-info-popover");
    const btn = document.getElementById("toolbar-btn-info");
    if (popover) popover.classList.add("hidden");
    if (btn) {
      btn.className = "p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition";
    }
    this.showReadValueTooltip(false);
  }

  // Alias kept for backwards compatibility
  openPaperInfoModal() {
    this.togglePaperInfoPopover();
  }

  renderPaperInfoContent() {
    const p = this.currentPaper;
    if (!p) return;

    // 1. Title Link
    const titleLink = document.getElementById("paper-info-title-link");
    if (titleLink) {
      titleLink.textContent = p.title || "Untitled Paper";
      const targetUrl = p.doi
        ? `https://doi.org/${p.doi}`
        : p.arxivId
        ? `https://arxiv.org/abs/${p.arxivId}`
        : p.url || "#";
      titleLink.href = targetUrl;
    }

    // 2. Authors & Year
    const authorsEl = document.getElementById("paper-info-authors");
    if (authorsEl) {
      const authList = p.authors && p.authors.length ? p.authors.join(", ") : "저자 정보 없음";
      authorsEl.textContent = authList;
      authorsEl.title = authList;
    }

    const yearEl = document.getElementById("paper-info-year");
    if (yearEl) {
      yearEl.textContent = String(p.year || "2025");
    }

    // 3. Citations Badge
    const citeCountEl = document.getElementById("paper-info-citations-count");
    if (citeCountEl) {
      citeCountEl.textContent = `${p.citationCount || 0}회 인용`;
    }
    const citeBtn = document.getElementById("paper-info-citations-btn");
    if (citeBtn) {
      citeBtn.href = `https://scholar.google.com/scholar?q=${encodeURIComponent(p.title || "")}`;
    }

    // 4. Citation Format Card: default to BibTeX
    this.activeCitationFormat = this.activeCitationFormat || "bibtex";
    this.switchCitationTab(this.activeCitationFormat);

    // Reset Reading Value Assessment Box
    const resBox = document.getElementById("reading-value-result-box");
    if (resBox) resBox.classList.add("hidden");
  }

  switchCitationTab(format) {
    this.activeCitationFormat = format;
    const formats = ["bibtex", "apa", "vancouver", "harvard"];
    for (const f of formats) {
      const tabBtn = document.getElementById(`cite-tab-${f}`);
      if (tabBtn) {
        if (f === format) {
          tabBtn.className = "font-bold text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-white pb-1 transition";
        } else {
          tabBtn.className = "font-normal text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 pb-1 transition";
        }
      }
    }

    const p = this.currentPaper;
    if (!p) return;
    const codeEl = document.getElementById("citation-code-display");
    if (codeEl) {
      const citationText = this.generateFormattedCitation(p, format);
      codeEl.textContent = citationText;
      this.currentCitationText = citationText;
    }
  }

  generateFormattedCitation(p, format) {
    const title = p.title || "Untitled Paper";
    const authors = Array.isArray(p.authors) ? p.authors : p.authors ? [p.authors] : [];
    const year = p.year || 2025;
    const venue = p.venue || p.journal || "arXiv preprint";

    // Clean Key: e.g. Thielicke2025EducationalEW
    let firstAuthorLast = "Author";
    if (authors.length > 0) {
      const parts = authors[0].trim().split(/\s+/);
      firstAuthorLast = parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, "");
    }
    const firstWord = (title.split(/\s+/)[0] || "Paper").replace(/[^a-zA-Z0-9]/g, "");
    const citeKey = `${firstAuthorLast}${year}${firstWord}`;

    if (format === "bibtex") {
      const bibAuthors = authors.length ? authors.join(" and ") : "Anonymous";
      return `@inproceedings{${citeKey},
  author = {${bibAuthors}},
  title = {${title}},
  year = {${year}}
}`;
    }

    if (format === "apa") {
      const apaAuthors = this.formatAuthorsAPA(authors);
      return `${apaAuthors} (${year}). ${title}.${venue ? ` ${venue}.` : ""}`;
    }

    if (format === "vancouver") {
      const vancAuthors = this.formatAuthorsVancouver(authors);
      return `${vancAuthors}. ${title}.${venue ? ` ${venue}.` : ""} ${year}.`;
    }

    if (format === "harvard") {
      const harvAuthors = this.formatAuthorsHarvard(authors);
      return `${harvAuthors}, ${year}. ${title}.${venue ? ` ${venue}.` : ""}`;
    }

    return title;
  }

  formatAuthorsAPA(authors) {
    if (!authors || !authors.length) return "Anonymous";
    const formatted = authors.map((a) => {
      const parts = a.trim().split(/\s+/);
      if (parts.length === 1) return parts[0];
      const last = parts.pop();
      const initials = parts.map((p) => p[0].toUpperCase() + ".").join(" ");
      return `${last}, ${initials}`;
    });
    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  }

  formatAuthorsVancouver(authors) {
    if (!authors || !authors.length) return "Anonymous";
    const formatted = authors.map((a) => {
      const parts = a.trim().split(/\s+/);
      if (parts.length === 1) return parts[0];
      const last = parts.pop();
      const initials = parts.map((p) => p[0].toUpperCase()).join("");
      return `${last} ${initials}`;
    });
    return formatted.join(", ");
  }

  formatAuthorsHarvard(authors) {
    if (!authors || !authors.length) return "Anonymous";
    const formatted = authors.map((a) => {
      const parts = a.trim().split(/\s+/);
      if (parts.length === 1) return parts[0];
      const last = parts.pop();
      const initials = parts.map((p) => p[0].toUpperCase() + ".").join("");
      return `${last}, ${initials}`;
    });
    if (formatted.length === 1) return formatted[0];
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
    return `${formatted.slice(0, -1).join(", ")} and ${formatted[formatted.length - 1]}`;
  }

  copyToClipboard(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {
        this.fallbackCopyText(text);
      });
      return true;
    }
    return this.fallbackCopyText(text);
  }

  fallbackCopyText(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  copyCurrentCitation(btn) {
    const text = this.currentCitationText;
    if (!text) return;
    this.copyToClipboard(text);
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<span class="text-emerald-500 font-bold text-xs">✓ 복사됨</span>`;
      setTimeout(() => {
        btn.innerHTML = origHtml;
      }, 1600);
    }
    this.showToast("인용 서지 정보가 클립보드에 복사되었습니다.");
  }

  copyPaperMetadata(btn) {
    const p = this.currentPaper;
    if (!p) return;
    const authors = Array.isArray(p.authors) ? p.authors.join(", ") : p.authors || "";
    const meta = `${p.title}\n저자: ${authors}\n출판연도: ${p.year || 2025}${p.arxivId ? `\narXiv: ${p.arxivId}` : ""}`;
    navigator.clipboard?.writeText(meta);
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<span class="text-emerald-500 font-bold text-xs">✓</span>`;
      setTimeout(() => {
        btn.innerHTML = origHtml;
      }, 1600);
    }
    this.showToast("논문 서지 정보가 클립보드에 복사되었습니다.");
  }

  focusCitationCard() {
    const card = document.getElementById("paper-citation-card");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.add("ring-2", "ring-indigo-500");
    setTimeout(() => {
      card.classList.remove("ring-2", "ring-indigo-500");
    }, 1200);
  }

  showReadValueTooltip(show) {
    const tt = document.getElementById("read-value-tooltip");
    if (!tt) return;
    if (show) tt.classList.remove("hidden");
    else tt.classList.add("hidden");
  }

  evaluateReadingValue() {
    const p = this.currentPaper;
    if (!p) return;
    const resBox = document.getElementById("reading-value-result-box");
    if (!resBox) return;

    resBox.classList.remove("hidden");
    resBox.innerHTML = `
      <div class="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold py-1">
        <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
        <span>내 라이브러리 및 관심사 기반 가치 평가 중...</span>
      </div>
    `;
    this.refreshIcons();

    setTimeout(() => {
      // Analyze user interests against current paper
      const libraryPapers = this.savedLibrary || [];
      const userSettings = window.researchDB?.getPromptSettings()?.systemPrompt || "";
      const textCorpus = (p.title + " " + (p.keywords || []).join(" ") + " " + (p.abstract || "")).toLowerCase();

      // Check keyword density
      let matchCount = 0;
      const interestTokens = ["piv", "fluid", "tunnel", "velocimetry", "vision", "ai", "model", "network", "experiment", "learning", "attention", "transformer", "flow", "reynolds"];
      for (const t of interestTokens) {
        if (textCorpus.includes(t)) matchCount++;
      }

      // Calculate score and category (정독 · 훑어보기 · 초록만 · 패스)
      let tier = "정독";
      let tierColor = "text-rose-600 dark:text-rose-400 bg-rose-500/15 border-rose-500/30";
      let tierEmoji = "🔥";
      let matchPct = Math.min(96, Math.max(78, 70 + matchCount * 5));
      let rationale = "현재 연구 관심사 및 실험 방법론과 매우 높은 일치도를 보입니다. 3장 실험 설정 및 4장 측정 수치를 중심으로 정독을 강력히 추천합니다.";

      if (matchCount < 2) {
        tier = "패스";
        tierColor = "text-zinc-600 dark:text-zinc-400 bg-zinc-500/15 border-zinc-500/30";
        tierEmoji = "⏭️";
        matchPct = 28;
        rationale = "내 라이브러리의 관심 주제와 공통점이 적습니다. 핵심 연구 주제에 집중하기 위해 읽지 않고 패스하는 것을 권장합니다.";
      } else if (matchCount < 4) {
        tier = "초록만";
        tierColor = "text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/30";
        tierEmoji = "📄";
        matchPct = 48;
        rationale = "배경 지식 참고용으로 가볍게 확인할 수 있습니다. 본문 전체보다는 서론과 초록의 핵심 결론 위주로 파악하는 것을 추천합니다.";
      } else if (matchCount < 6) {
        tier = "훑어보기";
        tierColor = "text-blue-600 dark:text-blue-400 bg-blue-500/15 border-blue-500/30";
        tierEmoji = "👀";
        matchPct = 72;
        rationale = "관련 선행 연구와 접점이 있습니다. 각 섹션의 첫 문단과 주요 그림(Figure)을 빠르게 훑어보며 핵심만 파악하세요.";
      }

      resBox.innerHTML = `
        <div class="flex items-center justify-between pb-1.5 border-b border-indigo-500/20">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg font-bold text-xs border ${tierColor} flex items-center gap-1">
              <span>${tierEmoji}</span>
              <span>${tier} 추천</span>
            </span>
            <span class="text-[11.5px] font-semibold text-zinc-500 dark:text-zinc-400">관심사 일치도: <strong class="text-indigo-600 dark:text-indigo-400">${matchPct}%</strong></span>
          </div>
          <button onclick="document.getElementById('reading-value-result-box').classList.add('hidden')" class="text-zinc-400 hover:text-zinc-600 text-xs">✕</button>
        </div>
        <p class="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed pt-1">
          ${rationale}
        </p>
      `;
    }, 450);
  }

  openAddReferenceModal() {
    const candidates = this.papers
      .filter((p) => p.id !== this.currentPaper?.id)
      .concat(this.relatedPapers);

    if (candidates.length === 0) {
      this.openExploreModal("");
      return;
    }

    const html = candidates
      .map(
        (item) => `
        <div class="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-bold text-xs truncate">${this.escapeHtml(item.title)}</div>
            <div class="text-[11px] text-zinc-500 truncate">${this.escapeHtml(
              item.authors ? (Array.isArray(item.authors) ? item.authors.join(", ") : item.authors) : ""
            )}</div>
          </div>
          <button onclick="app.attachExtraReferencePaper('${this.escapeAttr(item.title)}'); app.closeUniversalModal();"
                  class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0">
            추가
          </button>
        </div>
      `
      )
      .join("");

    this.openUniversalModal(
      "참고 논문 추가",
      "비교 토론에 함께 참조할 논문을 선택하세요",
      `<div class="space-y-2">${html}</div>`
    );
  }

  attachExtraReferencePaper(title) {
    if (!this.attachedExtraPapers.includes(title)) {
      this.attachedExtraPapers.push(title);
    }
    const banner = document.getElementById("chat-attachment-banner");
    const label = document.getElementById("chat-attachment-label");
    if (banner && label) {
      banner.classList.remove("hidden");
      label.textContent = `📎 참고 논문: ${this.attachedExtraPapers.join(", ")}`;
    }
  }

  // ================= OUTLINE DRAWER & IN-PAPER SEARCH =================
  toggleOutlineDrawer(force = null) {
    const drawer = document.getElementById("outline-drawer");
    const list = document.getElementById("outline-drawer-list");
    if (!drawer || !list) return;

    const show = typeof force === "boolean" ? force : drawer.classList.contains("hidden");
    if (!show) {
      drawer.classList.add("hidden");
      return;
    }

    if (!this.requireActivePaper("논문 목차")) return;

    list.innerHTML = (this.currentPaper.sections || [])
      .map(
        (s) => `
        <button onclick="app.jumpToOutlineSection('${this.escapeAttr(s.id)}', ${s.page || 1})"
                class="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between gap-2">
          <span class="font-medium truncate">${this.escapeHtml(s.number)}. ${this.escapeHtml(s.title)}</span>
          <span class="text-[10px] font-mono text-zinc-400 shrink-0">P.${s.page || 1}</span>
        </button>
      `
      )
      .join("");

    drawer.classList.remove("hidden");
  }

  jumpToOutlineSection(secId, pageNum) {
    this.toggleOutlineDrawer(false);
    if (this.currentPaper?.isUploadedPdf && this.showingRawPdfCanvas) {
      this.jumpToPage(pageNum);
    } else {
      document.getElementById(secId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  toggleSearchBar(force = null) {
    const bar = document.getElementById("in-paper-search-bar");
    if (!bar) return;
    const show = typeof force === "boolean" ? force : bar.classList.contains("hidden");
    if (show) {
      if (!this.requireActivePaper("본문 내 검색")) return;
      bar.classList.remove("hidden");
      document.getElementById("in-paper-search-input")?.focus();
    } else {
      bar.classList.add("hidden");
    }
  }

  performInPaperSearch(query) {
    if (!this.currentPaper) return;
    const q = (query || "").trim().toLowerCase();
    if (!q) return;
    for (const sec of this.currentPaper.sections || []) {
      for (const p of sec.paragraphs || []) {
        if (p.en.toLowerCase().includes(q) || (p.ko && p.ko.toLowerCase().includes(q))) {
          document.getElementById(p.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
    }
  }


  // ================= TEXT SELECTION WATERMARK & MARGIN FILTER =================
  filterWatermarkSpansFromSelection(container) {
    if (!container) return;
    const spans = container.querySelectorAll("span");
    spans.forEach((span) => {
      const text = (span.textContent || "").trim();
      const transform = span.style.transform || "";
      // Exclude vertical rotated metadata (arXiv watermarks, timestamps) from selection
      const isRotated =
        /rotate\s*\(\s*(-?90|-?270)deg\)/i.test(transform) ||
        /matrix\(\s*0\s*,/i.test(transform);
      const isArxivWatermark =
        /arXiv:\d{4}\.\d+/i.test(text) ||
        (/\[[a-z\-]+(\.[a-z\-]+)?\]/i.test(text) && text.length < 50);
      const leftPx = parseFloat(span.style.left || "0");
      const isGutter = leftPx < 18 && isRotated;

      if (isRotated || isArxivWatermark || isGutter) {
        span.style.userSelect = "none";
        span.style.webkitUserSelect = "none";
        span.style.pointerEvents = "none";
        span.setAttribute("data-no-select", "true");
      }
    });
  }

  // ================= TEXT SELECTION FLOATING TOOLBAR & MULTI-COLOR MARKUP =================
  setupSelectionListener() {
    const viewport = document.getElementById("center-viewport");
    if (!viewport) return;

    this.currentHighlightColor = this.currentHighlightColor || "pink";

    document.addEventListener("mouseup", (e) => {
      if (!this.currentPaper) return;
      const toolbar = document.getElementById("selection-toolbar");
      if (toolbar && toolbar.contains(e.target)) return;

      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";

        if (!text || text.length < 2 || !sel.anchorNode || !viewport.contains(sel.anchorNode)) {
          this.hideSelectionToolbar();
          return;
        }

        this.currentSelectionText = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (toolbar) {
          toolbar.classList.remove("hidden");
          let top = rect.bottom + 8;
          if (top + 280 > window.innerHeight) {
            top = Math.max(16, rect.top - 280);
          }
          let left = Math.max(16, Math.min(window.innerWidth - 290, rect.left - 20));
          toolbar.style.top = `${top}px`;
          toolbar.style.left = `${left}px`;
          this.syncActiveHighlightColorUI();
          this.showInfographicPreview(false);
          this.showHighlightColors(false);
        }
      }, 20);
    });

    // Dismiss selection toolbar on mousedown outside
    document.addEventListener("mousedown", (e) => {
      const toolbar = document.getElementById("selection-toolbar");
      if (toolbar && !toolbar.classList.contains("hidden")) {
        if (!toolbar.contains(e.target)) {
          setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
              this.hideSelectionToolbar();
            }
          }, 80);
        }
      }
    });

    // Keyboard Shortcuts (E: 설명, I: 인포그래픽, H: 하이라이트, T: 번역, C: 주석, Enter: AI 질문)
    window.addEventListener("keydown", (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
        return;
      }

      const toolbar = document.getElementById("selection-toolbar");
      const isToolbarVisible = toolbar && !toolbar.classList.contains("hidden");
      const selText = this.currentSelectionText || window.getSelection()?.toString().trim();

      if (!isToolbarVisible && (!selText || selText.length < 2)) return;
      if (!this.currentSelectionText && selText) {
        this.currentSelectionText = selText;
      }

      const key = e.key.toLowerCase();
      if (key === "e") {
        e.preventDefault();
        this.triggerSelectionAction("explain");
      } else if (key === "i") {
        e.preventDefault();
        this.generateInfographicFromSelection();
      } else if (key === "h") {
        e.preventDefault();
        this.applyHighlightWithColor(this.currentHighlightColor || "pink", e);
      } else if (key === "t") {
        e.preventDefault();
        this.triggerSelectionAction("translate");
      } else if (key === "c") {
        e.preventDefault();
        this.addCommentToSelection();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.askChatWithSelection();
      }
    });
  }

  showInfographicPreview(show) {
    const flyout = document.getElementById("infographic-preview-flyout");
    if (!flyout) return;
    if (show) {
      const toolbar = document.getElementById("selection-toolbar");
      if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        if (rect.right + 310 > window.innerWidth) {
          flyout.style.left = "auto";
          flyout.style.right = "calc(100% + 10px)";
        } else {
          flyout.style.left = "calc(100% + 10px)";
          flyout.style.right = "auto";
        }
      }
      flyout.classList.remove("hidden");
    } else {
      flyout.classList.add("hidden");
    }
  }

  showHighlightColors(show) {
    const activeDot = document.getElementById("highlight-active-dot");
    const picker = document.getElementById("highlight-color-picker");
    if (!picker || !activeDot) return;
    if (show) {
      activeDot.classList.add("hidden");
      picker.classList.remove("hidden");
      picker.classList.add("flex");
    } else {
      picker.classList.add("hidden");
      picker.classList.remove("flex");
      activeDot.classList.remove("hidden");
    }
  }

  applyHighlightWithColor(color = "pink", event = null) {
    if (event) event.stopPropagation();
    this.currentHighlightColor = color;
    this.syncActiveHighlightColorUI();
    this.saveUserHighlightFromSelection(color);
  }

  syncActiveHighlightColorUI() {
    const dot = document.getElementById("highlight-active-dot");
    if (!dot) return;
    const colorMap = {
      pink: "#f472b6",
      yellow: "#fef08a",
      green: "#bbf7d0",
      cyan: "#bae6fd",
      coral: "#fecaca",
      purple: "#c084fc"
    };
    dot.style.backgroundColor = colorMap[this.currentHighlightColor] || "#f472b6";
  }

  addCommentToSelection() {
    const phrase = this.currentSelectionText;
    if (!phrase || !this.currentPaper) return;
    this.hideSelectionToolbar();

    const pid = this.currentPaper.id;
    if (!this.userNotesByPaper[pid]) this.userNotesByPaper[pid] = [];

    const noteObj = {
      id: `un-${Date.now()}`,
      phrase,
      color: this.currentHighlightColor || "yellow",
      note: ""
    };

    this.userNotesByPaper[pid].unshift(noteObj);
    localStorage.setItem(this.notesStorageKey, JSON.stringify(this.userNotesByPaper));

    window.getSelection()?.removeAllRanges();
    this.renderCurrentPaper();
    this.inspectUserNote(noteObj.id, null);
    setTimeout(() => {
      const input = document.getElementById("inline-hl-note-input");
      input?.focus();
    }, 120);
  }

  hideSelectionToolbar() {
    document.getElementById("selection-toolbar")?.classList.add("hidden");
    this.showInfographicPreview(false);
    this.showHighlightColors(false);
  }

  async triggerSelectionAction(action) {
    const selectedText = this.currentSelectionText;
    if (!selectedText || !this.currentPaper) return;
    this.hideSelectionToolbar();

    const activeModelName = window.moonlightAI ? window.moonlightAI.getModelDisplayName() : "AI 연구 동료";
    const hasKey = window.moonlightAI && window.moonlightAI.hasApiKey();

    const titleMap = {
      explain: hasKey ? `💡 ${activeModelName} 문맥 설명` : "💡 AI 연구 동료 문맥 설명",
      translate: hasKey ? `🌐 ${activeModelName} 학술 전문 번역` : "🌐 학술 전문 번역",
      summarize: hasKey ? `📝 ${activeModelName} 선택 구절 3줄 요약` : "📝 선택 구절 3줄 요약"
    };

    this.showFloatingCard(
      titleMap[action] || "AI 즉시 분석",
      `<div class="flex items-center gap-2 text-indigo-500 py-2">
         <div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
         <span>${hasKey ? `${this.escapeHtml(activeModelName)} 모델이 구절을 심층 분석하고 있습니다...` : "선택한 구절을 분석하고 있습니다..."}</span>
       </div>`
    );

    const md = await window.moonlightAI.analyzeSelection(action, selectedText, this.currentPaper);
    this.lastFloatingResult = { selectedText, resultMarkdown: md };
    this.showFloatingCard(titleMap[action], this.renderMarkdownWithMath(md));

    window.researchDB?.logActivity({
      type: "ai_explain",
      paperId: this.currentPaper.id,
      paperTitle: this.currentPaper.title,
      quote: selectedText.slice(0, 120),
      detail: `${titleMap[action]} 완료`
    });
  }

  saveUserHighlightFromSelection(color = "pink") {
    const phrase = this.currentSelectionText;
    if (!phrase || !this.currentPaper) return;
    this.hideSelectionToolbar();

    const pid = this.currentPaper.id;
    if (!this.userNotesByPaper[pid]) this.userNotesByPaper[pid] = [];

    const noteObj = {
      id: `un-${Date.now()}`,
      phrase,
      color: color || this.currentHighlightColor || "pink",
      note: "핵심 체크 구절"
    };

    this.userNotesByPaper[pid].unshift(noteObj);
    localStorage.setItem(this.notesStorageKey, JSON.stringify(this.userNotesByPaper));

    window.researchDB?.logActivity({
      type: "highlight",
      paperId: pid,
      paperTitle: this.currentPaper.title,
      quote: phrase.slice(0, 120),
      detail: `${(color || "pink").toUpperCase()} 형광펜 하이라이트 추가`
    });

    window.getSelection()?.removeAllRanges();
    this.renderCurrentPaper();
    this.inspectUserNote(noteObj.id, null);
  }

  askChatWithSelection() {
    const phrase = this.currentSelectionText;
    if (!phrase) return;
    this.hideSelectionToolbar();

    this.attachedContextQuote = phrase;
    const banner = document.getElementById("chat-attachment-banner");
    const label = document.getElementById("chat-attachment-label");
    if (banner && label) {
      banner.classList.remove("hidden");
      label.textContent = `📌 선택 구절: "${phrase}"`;
    }
    this.focusRightSection("discussion");
  }

  clearChatAttachment() {
    this.attachedContextQuote = null;
    this.attachedExtraPapers = [];
    document.getElementById("chat-attachment-banner")?.classList.add("hidden");
  }

  showFloatingCard(title, bodyHtml) {
    const card = document.getElementById("floating-ai-card");
    const titleEl = document.getElementById("floating-card-title");
    const bodyEl = document.getElementById("floating-card-body");
    if (!card || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    card.classList.remove("hidden");
    this.refreshIcons();
  }

  closeFloatingCard() {
    document.getElementById("floating-ai-card")?.classList.add("hidden");
  }

  continueFloatingCardInChat() {
    if (!this.lastFloatingResult) {
      this.closeFloatingCard();
      return;
    }
    const key = this.getActiveDiscussionKey();
    if (!this.discussionsByPaper[key]) this.discussionsByPaper[key] = [];
    this.discussionsByPaper[key].push({
      role: "user",
      context: this.lastFloatingResult.selectedText,
      content: "선택한 구절 분석 내용 보기"
    });
    this.discussionsByPaper[key].push({
      role: "assistant",
      content: this.lastFloatingResult.resultMarkdown
    });
    this.closeFloatingCard();
    this.renderDiscussionSection();
  }

  // ================= RIGHT PANEL & FAR-RIGHT RAIL CONTROLS =================
  focusRightSection(secName) {
    if (!this.rightPanelVisible) {
      this.toggleRightAiPanel();
    }
    this.accordionOpen[secName] = true;
    document.getElementById(`acc-body-${secName}`)?.classList.remove("hidden");
    if (secName === "discussion") {
      document.getElementById("discussion-section")?.scrollIntoView({ behavior: "smooth" });
      document.getElementById("chat-input")?.focus();
    } else {
      const scroller = document.getElementById("right-scroll-sections");
      if (scroller) scroller.scrollTop = 0;
    }
  }

  toggleRightAiPanel() {
    this.rightPanelVisible = !this.rightPanelVisible;
    const panel = document.getElementById("right-ai-panel");
    if (this.rightPanelVisible) {
      panel?.classList.remove("hidden");
      panel?.classList.add("flex");
    } else {
      panel?.classList.add("hidden");
      panel?.classList.remove("flex");
    }
  }

  cycleModelQuick() {
    const models = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
    const idx = models.indexOf(window.moonlightAI.getActiveModel());
    const next = models[(idx + 1) % models.length];
    window.moonlightAI.setConfig(window.moonlightAI.apiKey, next);
    this.updateModelPillUI();
  }

  updateModelPillUI() {
    const name = window.moonlightAI ? window.moonlightAI.getModelDisplayName() : "Gemini 3.8 Flash";
    const label = document.getElementById("chat-model-name-label");
    if (label) {
      label.textContent = name;
    } else {
      const pill = document.getElementById("chat-model-pill");
      if (pill) pill.textContent = name;
    }
  }

  // ================= REAL PDF UPLOAD + LAYOUT PARSER + INDEXEDDB PERSISTENCE =================
  async handlePdfUpload(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      await this.processPdfArrayBuffer(file.name, arrayBuffer, true);
    } catch (err) {
      this.showFloatingCard("⚠️ PDF 업로드 오류", `<p>${this.escapeHtml(err.message)}</p>`);
    } finally {
      event.target.value = "";
    }
  }

  async renderPdfArrayBufferToCanvas(arrayBuffer, paperId) {
    const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
    if (!pdfWrapper || !window.pdfjsLib) return { pagesText: [], pagesDataList: [] };

    this.activePdfArrayBuffer = arrayBuffer;
    const clonedBytes = arrayBuffer.slice(0);
    const pdfDoc = await window.pdfjsLib.getDocument({ data: clonedBytes }).promise;
    this.activePdfDoc = pdfDoc;

    try {
      const meta = await pdfDoc.getMetadata().catch(() => null);
      if (meta && meta.info && this.currentPaper && this.currentPaper.id === paperId) {
        const info = meta.info;
        this.currentPaper.pdfMetadata = {
          title: info.Title || this.currentPaper.title,
          author: info.Author || (this.currentPaper.authors ? this.currentPaper.authors.join("; ") : "-"),
          subject: info.Subject || "-",
          keywords: info.Keywords || "-",
          creationDate: info.CreationDate ? this.formatPdfDate(info.CreationDate) : "-",
          modDate: info.ModDate ? this.formatPdfDate(info.ModDate) : "-",
          creator: info.Creator || (this.currentPaper.arxivId ? "arXiv GenPDF (tex2pdf:)" : "-"),
          producer: info.Producer || "pikepdf 8.15.1",
          pdfVersion: info.PDFFormatVersion || "1.5",
          isLinearized: Boolean(info.IsLinearized)
        };
      }
      const p1 = await pdfDoc.getPage(1).catch(() => null);
      if (p1 && this.currentPaper && this.currentPaper.id === paperId) {
        const vp1 = p1.getViewport({ scale: 1 });
        const widthMm = (vp1.width * 25.4 / 72).toFixed(1);
        const heightMm = (vp1.height * 25.4 / 72).toFixed(1);
        let paperType = "사용자 정의";
        if (Math.abs(vp1.width - 612) < 8 && Math.abs(vp1.height - 792) < 8) paperType = "레터";
        else if (Math.abs(vp1.width - 595.28) < 8 && Math.abs(vp1.height - 841.89) < 8) paperType = "A4";
        const orientStr = vp1.height >= vp1.width ? "세로 방향" : "가로 방향";
        this.currentPaper.pageSizeStr = `${widthMm} × ${heightMm} mm (${paperType}, ${orientStr})`;
        this.currentPaper.totalPages = pdfDoc.numPages;
      }
    } catch (e) {
      console.warn("Metadata extraction warning:", e);
    }

    const maxPages = Math.min(pdfDoc.numPages, 15);
    const pagesText = [];
    const pagesDataList = [];
    pdfWrapper.innerHTML = "";
    pdfWrapper.classList.remove("split-page-trans-mode");

    const currentScale = (this.zoomLevel / 100) * 1.33;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const unscaledVp = page.getViewport({ scale: 1.0 });
      const cssViewport = page.getViewport({ scale: currentScale });
      const renderViewport = page.getViewport({ scale: currentScale * dpr });

      const pageRow = document.createElement("div");
      pageRow.className = "pdf-page-row";
      pageRow.setAttribute("data-page-num", String(pageNum));

      const pageContainer = document.createElement("div");
      pageContainer.className = "pdf-page-container";
      pageContainer.setAttribute("data-page-num", String(pageNum));
      pageContainer.setAttribute("data-base-width", String(unscaledVp.width));
      pageContainer.setAttribute("data-base-height", String(unscaledVp.height));
      pageContainer.style.width = `${Math.floor(cssViewport.width)}px`;
      pageContainer.style.height = `${Math.floor(cssViewport.height)}px`;

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
      pageContainer.appendChild(canvas);

      const textContent = await page.getTextContent();
      pagesDataList.push({
        items: textContent.items || [],
        width: cssViewport.width,
        height: cssViewport.height,
        scale: currentScale,
        viewportTransform: cssViewport.transform
      });

      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer pdf-text-layer";
      textLayerDiv.style.setProperty("--scale-factor", String(cssViewport.scale || 1));

      const strings = [];
      for (const item of textContent.items) {
        if (item.str) strings.push(item.str);
      }
      pagesText.push(strings.join(" "));

      if (window.pdfjsLib.renderTextLayer) {
        const textLayerTask = window.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: cssViewport,
          textDivs: []
        });
        if (textLayerTask?.promise) {
          await textLayerTask.promise;
        }
        this.filterWatermarkSpansFromSelection(textLayerDiv);
      }
      pageContainer.appendChild(textLayerDiv);
      pageRow.appendChild(pageContainer);
      pdfWrapper.appendChild(pageRow);
    }

    this.renderedPdfPaperId = paperId;
    return { pagesText, pagesDataList, numPages: pdfDoc.numPages };
  }

  async processPdfArrayBuffer(fileName, arrayBuffer, saveToDb = true) {
    document.getElementById("empty-workspace-onboarding")?.classList.add("hidden");
    document.getElementById("page-translate-widget")?.classList.remove("hidden");
    document.getElementById("original-pdf-pill")?.classList.remove("hidden");

    const pdfWrapper = document.getElementById("pdfjs-pages-wrapper");
    const sheetEl = document.getElementById("paper-sheet");
    if (pdfWrapper && sheetEl) {
      pdfWrapper.innerHTML = `<div class="p-8 text-center text-sm text-indigo-500 font-semibold">⏳ '${this.escapeHtml(fileName)}' PDF.js 렌더링 · 다단 레이아웃 분석 · 로컬 DB 저장 중...</div>`;
      pdfWrapper.classList.remove("hidden");
      sheetEl.classList.add("hidden");
      this.showingRawPdfCanvas = true;
    }

    const tempId = `uploaded-${Date.now()}`;
    const bytesForSave = arrayBuffer.slice(0);
    const { pagesText, pagesDataList } = await this.renderPdfArrayBufferToCanvas(arrayBuffer, tempId);

    const structuredDoc = window.pdfEngine
      ? window.pdfEngine.extractStructuredDocument(fileName, pagesDataList)
      : { detectedTitle: fileName, sections: [], pageBlocksByPage: {}, equations: [], figures: [], citations: [] };

    const analyzed = window.moonlightAI.buildStructuredUploadedPaper(
      fileName,
      pagesText,
      structuredDoc
    );
    analyzed.id = tempId;
    this.renderedPdfPaperId = analyzed.id;

    if (saveToDb && window.researchDB) {
      await window.researchDB.saveUploadedPaper(analyzed, bytesForSave);
    }

    this.papers.unshift(analyzed);
    this.currentPaper = analyzed;
    this.layoutTranslationEnabled = false;
    this.pageTranslationEnabled = false;
    this.syncTranslationButtonsUI();

    const totalPagesEl = document.getElementById("total-pages-label");
    const pageInput = document.getElementById("page-num-input");
    if (totalPagesEl) totalPagesEl.textContent = String(analyzed.totalPages || pagesText.length);
    if (pageInput) pageInput.value = "1";

    this.updateLibrarySaveStarUI();
    this.renderLeftMaterialsList();
    this.renderCurrentPaper();
    this.renderRightPanelAll();
    this.refreshLiveRecommendations();

    this.autoHighlightsEnabled = false;
    this.applyAutoHighlights();

    const pillLabel = document.getElementById("original-pdf-pill-label");
    if (pillLabel) pillLabel.textContent = "AI 구조화 뷰로 보기";

    // Automatically localize Keyword Dictionary, 3-Line Summary, and Summary into user's preferred language!
    this.localizePaperInBackground(analyzed);
  }

  async localizePaperInBackground(paper) {
    if (!paper || !window.moonlightAI) return;
    try {
      await window.moonlightAI.localizeAndEnrichPaper(paper);
      if (this.currentPaper?.id === paper.id) {
        this.renderKeywordSection();
        this.renderThreeLineSection();
        this.renderSummarySection();
      }
    } catch (err) {
      console.warn("Background paper localization skipped:", err);
    }
  }

  // ================= MOONLIGHT EXPORT OPTIONS POPOVER (내보내기 옵션) =================
  toggleExportPopover(event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById("export-options-popover");
    const btn = document.getElementById("toolbar-btn-export");
    if (!popover) return;

    if (!popover.classList.contains("hidden")) {
      this.closeExportPopover();
      return;
    }

    if (!this.requireActivePaper("내보내기 옵션")) return;

    this.syncExportTogglesUI();
    if (btn) {
      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 8}px`;
      popover.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
    }
    popover.classList.remove("hidden");
    if (btn) {
      btn.className = "p-1.5 rounded-lg border-[1.5px] border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white transition";
    }
    this.refreshIcons();
  }

  closeExportPopover() {
    const popover = document.getElementById("export-options-popover");
    const btn = document.getElementById("toolbar-btn-export");
    if (popover) popover.classList.add("hidden");
    if (btn) {
      btn.className = "p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition";
    }
  }

  showExportTooltip(show) {
    // No-op: tooltip removed to prevent toolbar overflow and unnecessary scrollbars
  }

  toggleExportPageTransOption() {
    this.exportIncludePageTrans = !this.exportIncludePageTrans;
    this.syncExportTogglesUI();
  }

  toggleExportLayoutTransOption() {
    this.exportIncludeLayoutTrans = !this.exportIncludeLayoutTrans;
    this.syncExportTogglesUI();
  }

  syncExportTogglesUI() {
    if (this.exportIncludeLayoutTrans === undefined) {
      this.exportIncludeLayoutTrans = true;
    }
    if (this.exportIncludePageTrans === undefined) {
      this.exportIncludePageTrans = false;
    }

    // 1. 페이지 번역 포함 toggle
    const pBtn = document.getElementById("toggle-export-page-trans");
    const pKnob = document.getElementById("knob-export-page-trans");
    if (pBtn && pKnob) {
      if (this.exportIncludePageTrans) {
        pBtn.className = "w-11 h-6 rounded-full bg-zinc-900 dark:bg-white relative transition-colors flex items-center px-0.5 shrink-0";
        pKnob.className = "w-5 h-5 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform translate-x-5";
      } else {
        pBtn.className = "w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 relative transition-colors flex items-center px-0.5 shrink-0";
        pKnob.className = "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0";
      }
    }

    // 2. 레이아웃 유지 번역 toggle
    const lBtn = document.getElementById("toggle-export-layout-trans");
    const lKnob = document.getElementById("knob-export-layout-trans");
    if (lBtn && lKnob) {
      if (this.exportIncludeLayoutTrans) {
        lBtn.className = "w-11 h-6 rounded-full bg-zinc-900 dark:bg-white relative transition-colors flex items-center px-0.5 shrink-0";
        lKnob.className = "w-5 h-5 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform translate-x-5";
      } else {
        lBtn.className = "w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 relative transition-colors flex items-center px-0.5 shrink-0";
        lKnob.className = "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0";
      }
    }
  }

  createShareLink() {
    if (!this.currentPaper) return;
    const p = this.currentPaper;
    const url = new URL(window.location.href);
    url.searchParams.set("paper", p.id);
    if (this.currentPage && this.currentPage > 1) {
      url.searchParams.set("page", String(this.currentPage));
    }
    const shareUrl = url.toString();
    this.copyToClipboard(shareUrl);
    this.closeExportPopover();
    this.showToast("🔗 논문 공유 링크가 클립보드에 복사되었습니다.");
  }

  rotateClockwise() {
    if (!this.currentPaper) return;
    this.pdfRotation = ((this.pdfRotation || 0) + 90) % 360;
    const elements = document.querySelectorAll("#pdfjs-pages-wrapper .pdf-page-container, #paper-sheet");
    elements.forEach((el) => {
      el.style.transition = "transform 0.25s ease-out";
      el.style.transform = this.pdfRotation ? `rotate(${this.pdfRotation}deg)` : "";
      if (this.pdfRotation === 90 || this.pdfRotation === 270) {
        el.style.margin = "40px auto";
      } else {
        el.style.margin = "";
      }
    });
    this.closeExportPopover();
    this.showToast(`🔄 시계 방향으로 90° 회전되었습니다 (${this.pdfRotation}°).`);
  }

  showFileInfoModal() {
    this.closeExportPopover();
    this.openFileInfoModal();
  }

  openFileInfoModal() {
    const modal = document.getElementById("file-info-modal");
    if (!modal) return;
    if (!this.requireActivePaper("파일 정보")) return;
    const p = this.currentPaper;

    const formatBytes = (bytes) => {
      if (!bytes || bytes <= 0) return "12.7 MB (13,273,296바이트)";
      const mb = (bytes / (1024 * 1024)).toFixed(1);
      const bStr = Number(bytes).toLocaleString("ko-KR");
      return `${mb} MB (${bStr}바이트)`;
    };

    const fileName = p.fileName || p.title || "Educational experiments with Particle Image Velocimetry in a small Prandtl water tunnel";
    const fileSize = formatBytes(p.fileSize || 13273296);
    const title = p.pdfMetadata?.title || p.title || fileName;
    const author = p.pdfMetadata?.author || (Array.isArray(p.authors) ? p.authors.join("; ") : (p.authors || "William Thielicke; Steffen Risius"));
    const subject = p.pdfMetadata?.subject || p.subject || "-";
    const keywords = p.pdfMetadata?.keywords || p.keywords || "-";
    const creationDate = p.pdfMetadata?.creationDate || p.creationDate || "-";
    const modDate = p.pdfMetadata?.modDate || p.modificationDate || "-";
    const creator = p.pdfMetadata?.creator || p.creator || (p.arxivId ? "arXiv GenPDF (tex2pdf:)" : "arXiv GenPDF (tex2pdf:)");
    const producer = p.pdfMetadata?.producer || p.producer || "pikepdf 8.15.1";
    const pdfVersion = p.pdfMetadata?.pdfVersion || p.pdfVersion || "1.5";
    const pageCount = p.totalPages || 10;
    const pageSize = p.pageSizeStr || "215.9 × 279.4 mm (레터, 세로 방향)";
    const linearized = (p.pdfMetadata?.isLinearized ?? p.isLinearized) ? "예" : "아니요";

    document.getElementById("fileinfo-filename").textContent = fileName;
    document.getElementById("fileinfo-filesize").textContent = fileSize;
    document.getElementById("fileinfo-title").textContent = title;
    document.getElementById("fileinfo-author").textContent = author;
    document.getElementById("fileinfo-subject").textContent = subject;
    document.getElementById("fileinfo-keywords").textContent = keywords;
    document.getElementById("fileinfo-creationdate").textContent = creationDate;
    document.getElementById("fileinfo-moddate").textContent = modDate;
    document.getElementById("fileinfo-creator").textContent = creator;
    document.getElementById("fileinfo-producer").textContent = producer;
    document.getElementById("fileinfo-pdfversion").textContent = pdfVersion;
    document.getElementById("fileinfo-pagecount").textContent = String(pageCount);
    document.getElementById("fileinfo-pagesize").textContent = pageSize;
    document.getElementById("fileinfo-linearized").textContent = linearized;

    modal.classList.remove("hidden");
  }

  closeFileInfoModal() {
    const modal = document.getElementById("file-info-modal");
    if (modal) modal.classList.add("hidden");
  }

  formatPdfDate(pdfDateStr) {
    if (!pdfDateStr) return "-";
    const match = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(pdfDateStr);
    if (match) {
      const year = match[1];
      const month = match[2];
      const day = match[3];
      const hour = match[4] || "00";
      const min = match[5] || "00";
      const sec = match[6] || "00";
      return `${year}. ${parseInt(month, 10)}. ${parseInt(day, 10)}. ${hour}:${min}:${sec}`;
    }
    return pdfDateStr;
  }

  async executeExportDownload() {
    if (!this.currentPaper) return;
    const p = this.currentPaper;
    this.closeExportPopover();

    const cleanTitle = (p.title || "paper").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 50);

    // If original uploaded PDF blob exists and no translation overlay is requested
    if (p.isUploadedPdf && p.originalPdfDataUrl && !this.exportIncludeLayoutTrans && !this.exportIncludePageTrans) {
      const a = document.createElement("a");
      a.href = p.originalPdfDataUrl;
      a.download = p.fileName || `${cleanTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.showToast(`원본 PDF 파일이 다운로드되었습니다 (${p.fileName || cleanTitle}).`);
      return;
    }

    // Rich Document Export with Translations & Summaries
    const brandName = window.researchDB?.getBrandConfig()?.appName || "Moonlight";
    const title = this.escapeHtml(p.title);
    const authors = this.escapeHtml((p.authors || []).join(", "));
    const year = p.year || 2025;

    let transContentHtml = "";
    if (this.exportIncludeLayoutTrans && p.pageBlocksByPage) {
      transContentHtml += `<section class="section"><h2>📑 1:1 레이아웃 유지 번역 (문단별 대조)</h2>`;
      for (const [pageNum, blocks] of Object.entries(p.pageBlocksByPage)) {
        transContentHtml += `<h3>Page ${pageNum}</h3><div class="page-blocks">`;
        for (const b of blocks) {
          transContentHtml += `<div class="block-pair">
            <p class="en"><strong>[원문]</strong> ${this.escapeHtml(b.en)}</p>
            <p class="ko"><strong>[번역]</strong> ${this.escapeHtml(b.ko || b.en)}</p>
          </div>`;
        }
        transContentHtml += `</div>`;
      }
      transContentHtml += `</section>`;
    }

    if (this.exportIncludePageTrans && p.pageTranslations) {
      transContentHtml += `<section class="section"><h2>📖 페이지별 전문 번역</h2>`;
      for (const [pg, t] of Object.entries(p.pageTranslations)) {
        transContentHtml += `<h3>Page ${pg} 번역</h3><div class="page-trans">${this.renderMarkdownWithMath(t)}</div>`;
      }
      transContentHtml += `</section>`;
    }

    const htmlDoc = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${brandName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.68; color: #1f2937; max-width: 860px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 24px; color: #111827; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    .meta { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
    .section { margin: 32px 0; padding: 20px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb; }
    h2 { font-size: 18px; margin-top: 0; color: #1f2937; }
    .block-pair { margin-bottom: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #f3f4f6; }
    .en { color: #4b5563; font-size: 13.5px; margin: 0 0 6px 0; }
    .ko { color: #111827; font-size: 14px; margin: 0; font-weight: 500; }
    @media print { body { max-width: 100%; margin: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">
    <div><strong>저자:</strong> ${authors} | <strong>연도:</strong> ${year}</div>
    <div><strong>출처:</strong> ${this.escapeHtml(p.arxivId ? "arXiv:" + p.arxivId : "Moonlight Paper Reader")}</div>
  </div>
  <div class="section">
    <h2>⚡ 3줄 핵심 요약</h2>
    <ol>${(p.threeLineSummary || []).map((s) => `<li>${this.escapeHtml(s)}</li>`).join("")}</ol>
  </div>
  <div class="section">
    <h2>📋 전체 요약</h2>
    <div>${this.renderMarkdownWithMath(p.summaryText || "")}</div>
  </div>
  ${transContentHtml}
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanTitle}_번역포함.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast("번역 옵션이 포함된 문서 파일이 다운로드되었습니다.");
  }

  executeExportPrint() {
    if (!this.currentPaper) return;
    this.closeExportPopover();

    if (this.exportIncludeLayoutTrans !== this.layoutTranslationEnabled) {
      this.toggleLayoutTranslation();
    }
    if (this.exportIncludePageTrans !== this.pageTranslationEnabled) {
      this.togglePageTranslation();
    }

    setTimeout(() => {
      window.print();
    }, 250);
  }

  // Legacy helper
  exportNotesMarkdown() {
    this.executeExportDownload();
  }

  // ================= TOOLBAR HOVER FLYOUTS (오토 하이라이트 · 이미지 설명 · 레이아웃 유지 번역) =================
  showToolbarHoverFlyout(flyoutId) {
    if (this.toolbarFlyoutTimer) {
      clearTimeout(this.toolbarFlyoutTimer);
      this.toolbarFlyoutTimer = null;
    }

    const btnMap = {
      autohl: "toolbar-btn-autohl",
      imagespec: "toolbar-btn-imagespec",
      layouttrans: "toolbar-btn-layout-trans"
    };

    const flyoutMap = {
      autohl: "flyout-autohl",
      imagespec: "flyout-imagespec",
      layouttrans: "flyout-layouttrans"
    };

    const targetBtnId = btnMap[flyoutId];
    const targetFlyoutId = flyoutMap[flyoutId];
    const btn = document.getElementById(targetBtnId);
    const flyout = document.getElementById(targetFlyoutId);
    if (!btn || !flyout) return;

    // Close any other open flyouts immediately
    Object.keys(flyoutMap).forEach((id) => {
      if (id !== flyoutId) {
        document.getElementById(flyoutMap[id])?.classList.add("hidden");
        const otherBtn = document.getElementById(btnMap[id]);
        if (otherBtn) {
          otherBtn.classList.remove("bg-zinc-100", "dark:bg-zinc-800", "border-zinc-300", "dark:border-zinc-600");
          otherBtn.classList.add("border-transparent");
        }
      }
    });

    // Make target visible and measure dimensions
    flyout.classList.remove("hidden");
    const rect = btn.getBoundingClientRect();
    const flyoutWidth = flyout.offsetWidth || 360;

    flyout.style.top = `${Math.round(rect.bottom + 6)}px`;

    if (flyoutId === "layouttrans") {
      const rightDist = window.innerWidth - rect.right;
      if (rect.left + flyoutWidth > window.innerWidth - 12) {
        flyout.style.right = `${Math.max(12, Math.round(rightDist))}px`;
        flyout.style.left = "auto";
      } else {
        flyout.style.left = `${Math.max(12, Math.round(rect.left))}px`;
        flyout.style.right = "auto";
      }
    } else {
      const leftPos = Math.max(12, Math.min(window.innerWidth - flyoutWidth - 12, rect.left));
      flyout.style.left = `${Math.round(leftPos)}px`;
      flyout.style.right = "auto";
    }

    btn.classList.remove("border-transparent");
    btn.classList.add("bg-zinc-100", "dark:bg-zinc-800", "border-zinc-300", "dark:border-zinc-600");
    this.activeToolbarFlyout = flyoutId;
  }

  hideToolbarHoverFlyout(flyoutId) {
    if (this.toolbarFlyoutTimer) {
      clearTimeout(this.toolbarFlyoutTimer);
    }
    this.toolbarFlyoutTimer = setTimeout(() => {
      this.closeAllToolbarFlyouts();
    }, 180);
  }

  onToolbarFlyoutEnter(flyoutId) {
    if (this.toolbarFlyoutTimer) {
      clearTimeout(this.toolbarFlyoutTimer);
      this.toolbarFlyoutTimer = null;
    }
    this.activeToolbarFlyout = flyoutId;
  }

  onToolbarFlyoutLeave(flyoutId) {
    if (this.toolbarFlyoutTimer) {
      clearTimeout(this.toolbarFlyoutTimer);
    }
    this.toolbarFlyoutTimer = setTimeout(() => {
      this.closeAllToolbarFlyouts();
    }, 180);
  }

  closeAllToolbarFlyouts() {
    if (this.toolbarFlyoutTimer) {
      clearTimeout(this.toolbarFlyoutTimer);
      this.toolbarFlyoutTimer = null;
    }
    const flyoutIds = ["flyout-autohl", "flyout-imagespec", "flyout-layouttrans"];
    flyoutIds.forEach((id) => {
      document.getElementById(id)?.classList.add("hidden");
    });
    const btnIds = ["toolbar-btn-autohl", "toolbar-btn-imagespec", "toolbar-btn-layout-trans"];
    btnIds.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.classList.remove("bg-zinc-100", "dark:bg-zinc-800", "border-zinc-300", "dark:border-zinc-600");
        b.classList.add("border-transparent");
      }
    });
    this.activeToolbarFlyout = null;
  }

  selectAutoHighlightPreset(presetName) {
    this.currentAutoHighlightPreset = presetName;
    const presets = ["basic", "deep", "stroke"];
    presets.forEach((p) => {
      const btn = document.getElementById(`preset-btn-${p}`);
      const dot = document.getElementById(`radio-dot-${p}`);
      if (!btn || !dot) return;
      if (p === presetName) {
        btn.className = "flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/60 cursor-pointer transition";
        dot.className = "w-4 h-4 rounded-full border-2 border-indigo-600 flex items-center justify-center mr-2.5";
        dot.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-600"></span>`;
      } else {
        btn.className = "flex items-center justify-between px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border border-transparent cursor-pointer transition";
        dot.className = "w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600 flex items-center justify-center mr-2.5";
        dot.innerHTML = `<span class="w-2 h-2 rounded-full bg-transparent"></span>`;
      }
    });

    if (this.autoHighlightsEnabled && this.currentPaper) {
      this.applyAutoHighlights();
    }
  }

  getPresetDisplayName() {
    const presetLabels = {
      basic: "Moonlight Basic",
      deep: "Deep Spread",
      stroke: "Point Stroke"
    };
    return presetLabels[this.currentAutoHighlightPreset] || "Moonlight Basic";
  }

  startAutoHighlightProcess() {
    this.closeAllToolbarFlyouts();
    if (!this.requireActivePaper("오토 하이라이트")) return;
    this.autoHighlightsEnabled = true;
    this.ensurePaperAutoHighlights(this.currentPaper);
    this.applyAutoHighlights();
    const label = this.getPresetDisplayName();
    this.showToast(`✨ 오토 하이라이트가 적용되었습니다 (${label})`);
  }

  // ================= MOONLIGHT 3-TAB SETTINGS MODAL (기본 설정 · 화면 설정 · 프롬프트 개인화) =================
  openSettingsModal(initialTab = "general") {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    // Load fresh copy of prompt settings into draft buffer
    const savedPrompts = window.researchDB ? window.researchDB.getPromptSettings() : {};
    this.promptDraft = JSON.parse(JSON.stringify(savedPrompts));
    this.activeExplainScope = "all";

    this.syncSettingsModalUI();
    this.switchSettingsTab(initialTab || "general");
    modal.classList.remove("hidden");
    this.refreshIcons();
  }

  closeSettingsModal() {
    document.getElementById("settings-modal")?.classList.add("hidden");
  }

  // Alias kept for backwards compatibility
  openApiModal() {
    this.openSettingsModal("general");
  }

  closeApiModal() {
    this.closeSettingsModal();
  }

  switchSettingsTab(tab) {
    this.activeSettingsTab = tab;
    const tabs = ["general", "display", "prompts"];
    for (const t of tabs) {
      const btn = document.getElementById(`settings-tab-btn-${t}`);
      const panel = document.getElementById(`settings-panel-${t}`);
      const isSelected = t === tab;
      if (btn) {
        if (isSelected) {
          if (t === "prompts") {
            btn.className = "px-3.5 py-2.5 rounded-xl text-left text-[14px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white border-[1.5px] border-transparent transition whitespace-nowrap";
          } else {
            btn.className = "px-3.5 py-2.5 rounded-xl text-left text-[14px] font-semibold border-[1.5px] border-zinc-900 dark:border-white text-zinc-900 dark:text-white bg-transparent transition whitespace-nowrap";
          }
        } else {
          btn.className = "px-3.5 py-2.5 rounded-xl text-left text-[14px] font-normal border-[1.5px] border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition whitespace-nowrap";
        }
      }
      if (panel) {
        if (isSelected) panel.classList.remove("hidden");
        else panel.classList.add("hidden");
      }
    }
  }

  syncSettingsModalUI() {
    if (!window.researchDB) return;
    const s = window.researchDB.getAppSettings();

    // --- Tab 1: 기본 설정 ---
    const autoBtn = document.getElementById("set-auto-open-btn");
    const autoKnob = document.getElementById("set-auto-open-knob");
    const periodGroup = document.getElementById("set-auto-open-period-group");
    if (autoBtn && autoKnob) {
      autoBtn.className = s.autoOpenPdf
        ? "w-11 h-6 rounded-full bg-[#5850ec] relative transition-colors flex items-center px-0.5 shrink-0"
        : "w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 relative transition-colors flex items-center px-0.5 shrink-0";
      autoKnob.className = s.autoOpenPdf
        ? "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-5"
        : "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0";
    }
    if (periodGroup) {
      periodGroup.className = s.autoOpenPdf
        ? "space-y-3.5 pt-0.5 opacity-100 transition-opacity"
        : "space-y-3.5 pt-0.5 opacity-45 pointer-events-none transition-opacity";
    }

    const rSession = document.getElementById("radio-period-session");
    const rAlways = document.getElementById("radio-period-always");
    const activeRadioCls = "mt-0.5 w-[18px] h-[18px] rounded-full border-2 border-[#5850ec] flex items-center justify-center shrink-0";
    const inactiveRadioCls = "mt-0.5 w-[18px] h-[18px] rounded-full border-2 border-zinc-300 dark:border-zinc-600 flex items-center justify-center shrink-0";
    if (rSession) {
      rSession.className = s.autoOpenPeriod === "session" ? activeRadioCls : inactiveRadioCls;
      rSession.firstElementChild.className =
        s.autoOpenPeriod === "session" ? "w-2.5 h-2.5 rounded-full bg-[#5850ec]" : "w-2.5 h-2.5 rounded-full bg-transparent";
    }
    if (rAlways) {
      rAlways.className = s.autoOpenPeriod === "always" ? activeRadioCls : inactiveRadioCls;
      rAlways.firstElementChild.className =
        s.autoOpenPeriod === "always" ? "w-2.5 h-2.5 rounded-full bg-[#5850ec]" : "w-2.5 h-2.5 rounded-full bg-transparent";
    }

    const langSelect = document.getElementById("set-language-select");
    if (langSelect) langSelect.value = s.language || "ko";

    const modelSelect = document.getElementById("set-ai-model-select");
    if (modelSelect) modelSelect.value = s.aiModel || "gemini-2.5-flash";

    const geminiInput = document.getElementById("modal-gemini-key");
    if (geminiInput) geminiInput.value = s.geminiApiKey || localStorage.getItem("research_studio_gemini_key") || window.moonlightAI?.apiKey || "";

    const openaiInput = document.getElementById("modal-openai-key");
    if (openaiInput) openaiInput.value = s.openaiApiKey || localStorage.getItem("research_studio_openai_key") || "";

    const claudeInput = document.getElementById("modal-claude-key");
    if (claudeInput) claudeInput.value = s.claudeApiKey || localStorage.getItem("research_studio_claude_key") || "";

    const verifiedStatus = s.verifiedApis || {
      gemini: window.moonlightAI ? window.moonlightAI.isProviderVerified("gemini") : false,
      openai: window.moonlightAI ? window.moonlightAI.isProviderVerified("openai") : false,
      claude: window.moonlightAI ? window.moonlightAI.isProviderVerified("claude") : false
    };

    const gKey = geminiInput ? geminiInput.value : "";
    const oKey = openaiInput ? openaiInput.value : "";
    const cKey = claudeInput ? claudeInput.value : "";

    this.updateProviderBadgeUI("gemini", !!verifiedStatus.gemini, !!gKey);
    this.updateProviderBadgeUI("openai", !!verifiedStatus.openai, !!oKey);
    this.updateProviderBadgeUI("claude", !!verifiedStatus.claude, !!cKey);
    this.syncAiModelSelectOptgroups(verifiedStatus);

    // --- Tab 2: 화면 설정 ---
    this.syncThemeSwitchUI();

    const fsVal = document.getElementById("set-fontsize-value");
    const fsSlider = document.getElementById("set-fontsize-slider");
    if (fsVal) fsVal.textContent = `${s.fontSizePx || 16}px`;
    if (fsSlider) fsSlider.value = String(s.fontSizePx || 16);

    const sepBtn = document.getElementById("set-sep-pagetrans-btn");
    const sepKnob = document.getElementById("set-sep-pagetrans-knob");
    if (sepBtn && sepKnob) {
      sepBtn.className = s.separatePageTransFontSize
        ? "w-11 h-6 rounded-full bg-[#5850ec] relative transition-colors flex items-center px-0.5 shrink-0"
        : "w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 relative transition-colors flex items-center px-0.5 shrink-0";
      sepKnob.className = s.separatePageTransFontSize
        ? "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-5"
        : "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0";
    }

    const delim = s.mathDelimiter || "bracket";
    for (const opt of ["bracket", "dollar", "none"]) {
      const card = document.getElementById(`math-card-${opt}`);
      const radio = document.getElementById(`math-radio-${opt}`);
      const selected = opt === delim;
      if (card) {
        card.className = selected
          ? "rounded-xl border border-[#5850ec] bg-indigo-50/30 dark:bg-indigo-500/10 px-4 py-3 flex items-center justify-between cursor-pointer transition"
          : "rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between cursor-pointer hover:border-[#5850ec] transition";
      }
      if (radio) {
        radio.className = selected
          ? "w-[18px] h-[18px] rounded-full border-2 border-[#5850ec] flex items-center justify-center"
          : "w-[18px] h-[18px] rounded-full border-2 border-zinc-300 dark:border-zinc-600 flex items-center justify-center";
        radio.firstElementChild.className = selected
          ? "w-2.5 h-2.5 rounded-full bg-[#5850ec]"
          : "w-2.5 h-2.5 rounded-full bg-transparent";
      }
    }

    // --- Tab 3: 프롬프트 개인화 ---
    if (this.promptDraft) {
      const sysEl = document.getElementById("prompt-system-input");
      const kwEl = document.getElementById("prompt-keyword-input");
      const threeEl = document.getElementById("prompt-threeline-input");
      const sumEl = document.getElementById("prompt-summary-input");
      if (sysEl) sysEl.value = this.promptDraft.systemPrompt || "";
      if (kwEl) kwEl.value = this.promptDraft.keywordPrompt || "";
      if (threeEl) threeEl.value = this.promptDraft.threeLinePrompt || "";
      if (sumEl) sumEl.value = this.promptDraft.summaryPrompt || "";
      this.syncExplainScopeUI();
    }
  }

  toggleSettingAutoOpenPdf() {
    if (!window.researchDB) return;
    const cur = window.researchDB.getAppSettings();
    window.researchDB.saveAppSettings({ autoOpenPdf: !cur.autoOpenPdf });
    this.syncSettingsModalUI();
  }

  setSettingAutoOpenPeriod(period) {
    if (!window.researchDB) return;
    window.researchDB.saveAppSettings({ autoOpenPeriod: period, autoOpenPdf: true });
    this.syncSettingsModalUI();
  }

  async changeSettingLanguage(langCode) {
    if (!window.researchDB) return;
    window.researchDB.saveAppSettings({ language: langCode });
    document.documentElement.lang = langCode;
    this.syncSettingsModalUI();

    if (this.currentPaper) {
      this.localizePaperInBackground(this.currentPaper);
      if (this.layoutTranslationEnabled) {
        await this.applyActiveLayoutTranslation();
      } else if (this.pageTranslationEnabled) {
        await this.applyActivePageTranslation();
      }
    }
  }

  changeSettingAiModel(modelId) {
    const provider = window.moonlightAI?.getModelProvider(modelId) || "gemini";
    const isVerified = window.moonlightAI?.isProviderVerified(provider);
    const modelName = window.moonlightAI?.getModelDisplayName(modelId) || modelId;

    if (!isVerified) {
      this.showFloatingCard(
        "⚠️ AI 모델 활성화 필요",
        `<p><strong>${this.escapeHtml(modelName)}</strong> 모델은 현재 비활성화 상태입니다.<br/>하단의 [AI API 키 연결 및 관리]에서 <strong>${provider.toUpperCase()}</strong> API 인증키를 입력하고 <strong>[API 키 모두 저장]</strong>을 눌러 검증을 완료해주세요.</p>`
      );
      this.syncSettingsModalUI();
      return;
    }

    window.moonlightAI?.setConfig(window.moonlightAI.apiKey, modelId);
    window.researchDB?.saveAppSettings({ aiModel: modelId });
    this.updateModelPillUI();
    this.renderChatModelPopoverContent();
    this.generateModelRecommendedQuestions(true);
    this.syncSettingsModalUI();
    this.showFloatingCard(
      `✦ 주 AI 모델 전환: ${modelName}`,
      `<p>웹페이지 전반적인 기능(학술 번역, 관련 논문 추천, 질문 의도 분석 등)을 <strong>${this.escapeHtml(modelName)}</strong> 모델이 전담하여 수행합니다.</p>`
    );
  }

  saveApiSettings() {
    return this.saveAllApiSettings();
  }

  toggleTheme() {
    const isCurrentlyDark = document.documentElement.classList.contains("dark");
    const nextLightMode = isCurrentlyDark;
    document.documentElement.classList.toggle("dark", !nextLightMode);
    window.researchDB?.saveAppSettings({ lightMode: nextLightMode });
    this.syncThemeSwitchUI();
  }

  syncThemeSwitchUI() {
    const isLight = !document.documentElement.classList.contains("dark");
    // Left sidebar switch
    const track = document.getElementById("light-mode-switch-track");
    const knob = document.getElementById("light-mode-switch-knob");
    if (track && knob) {
      if (isLight) {
        track.className = "w-8 h-4 rounded-full bg-[#5850ec] relative transition-colors flex items-center px-0.5";
        knob.className = "w-3 h-3 rounded-full bg-white shadow transform transition-transform translate-x-4";
      } else {
        track.className = "w-8 h-4 rounded-full bg-zinc-700 relative transition-colors flex items-center px-0.5";
        knob.className = "w-3 h-3 rounded-full bg-zinc-300 shadow transform transition-transform translate-x-0";
      }
    }
    // Settings modal -> 화면 설정 -> 라이트 모드 switch
    const setLightBtn = document.getElementById("set-light-mode-btn");
    const setLightKnob = document.getElementById("set-light-mode-knob");
    if (setLightBtn && setLightKnob) {
      setLightBtn.className = isLight
        ? "w-11 h-6 rounded-full bg-[#5850ec] relative transition-colors flex items-center px-0.5 shrink-0"
        : "w-11 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 relative transition-colors flex items-center px-0.5 shrink-0";
      setLightKnob.className = isLight
        ? "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-5"
        : "w-5 h-5 rounded-full bg-white shadow transition-transform translate-x-0";
    }
  }

  changeSettingFontSize(pxVal) {
    const px = Math.min(24, Math.max(12, Number(pxVal) || 16));
    window.researchDB?.saveAppSettings({ fontSizePx: px });
    const fsVal = document.getElementById("set-fontsize-value");
    if (fsVal) fsVal.textContent = `${px}px`;
    this.applyFontSizesUI();
  }

  toggleSettingSeparatePageTransSize() {
    if (!window.researchDB) return;
    const cur = window.researchDB.getAppSettings();
    window.researchDB.saveAppSettings({
      separatePageTransFontSize: !cur.separatePageTransFontSize
    });
    this.syncSettingsModalUI();
    this.applyFontSizesUI();
  }

  setPageTransFontSize(pxVal) {
    const px = Math.min(24, Math.max(12, Number(pxVal) || 16));
    window.researchDB?.saveAppSettings({ pageTransFontSizePx: px });
    this.applyFontSizesUI();
  }

  adjustPageTransFontSize(delta) {
    const cur = window.researchDB?.getAppSettings()?.pageTransFontSizePx || 16;
    this.setPageTransFontSize(cur + delta);
  }

  setSettingMathDelimiter(delim) {
    window.researchDB?.saveAppSettings({ mathDelimiter: delim });
    this.syncSettingsModalUI();
  }

  selectExplainPromptScope(scope) {
    if (!this.promptDraft) {
      this.promptDraft = window.researchDB ? window.researchDB.getPromptSettings() : { explainSubPrompts: {} };
    }
    // Toggle back to 'all' if clicking already-selected chip
    this.activeExplainScope = this.activeExplainScope === scope ? "all" : scope;
    this.syncExplainScopeUI();
  }

  syncExplainScopeUI() {
    const scopes = ["formula", "figure", "paragraph", "sentence"];
    const placeholders = {
      all: "수식과 알고리즘은 직관을 먼저 설명하고 코드 구현과 연결해주세요",
      formula: "수식의 각 변수·기호가 뜻하는 물리적/수학적 의미와 직관을 단계별로 설명해주세요",
      figure: "그림(figure)과 표의 축, 실험 비교군, 추세 및 핵심 결론을 중심으로 설명해주세요",
      paragraph: "문단의 핵심 주장과 앞뒤 문맥에서의 논리적 역할을 구조화해 설명해주세요",
      sentence: "문장 구조를 분석하고 학술적 함의를 알기 쉽게 풀어서 설명해주세요"
    };

    for (const sc of scopes) {
      const chip = document.getElementById(`explain-chip-${sc}`);
      if (!chip) continue;
      const isSelected = this.activeExplainScope === sc;
      const hasSavedSub = Boolean(this.promptDraft?.explainSubPrompts?.[sc]?.trim());
      chip.className = isSelected
        ? "px-2.5 py-0.5 rounded-full bg-[#5850ec] text-white text-xs font-semibold shadow-sm transition"
        : hasSavedSub
        ? "px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition"
        : "px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium hover:bg-indigo-500/15 transition";
    }

    const explainTextarea = document.getElementById("prompt-explain-input");
    if (explainTextarea) {
      explainTextarea.placeholder = placeholders[this.activeExplainScope] || placeholders.all;
      if (this.activeExplainScope === "all") {
        explainTextarea.value = this.promptDraft?.explainPrompt || "";
      } else {
        explainTextarea.value = this.promptDraft?.explainSubPrompts?.[this.activeExplainScope] || "";
      }
    }
  }

  handleExplainPromptInput(val) {
    if (!this.promptDraft) {
      this.promptDraft = window.researchDB ? window.researchDB.getPromptSettings() : { explainSubPrompts: {} };
    }
    if (this.activeExplainScope === "all") {
      this.promptDraft.explainPrompt = val;
    } else {
      if (!this.promptDraft.explainSubPrompts) this.promptDraft.explainSubPrompts = {};
      this.promptDraft.explainSubPrompts[this.activeExplainScope] = val;
    }
    this.markPromptSettingsDirty();
  }

  markPromptSettingsDirty() {
    const saveBtn = document.getElementById("set-prompts-save-btn");
    if (saveBtn) {
      saveBtn.textContent = "저장";
      saveBtn.className =
        "px-7 py-2.5 rounded-xl bg-[#5850ec] hover:bg-indigo-500 text-white text-sm font-bold transition shadow-md";
    }
  }

  async savePromptPersonalization() {
    if (!window.researchDB) return;
    if (!this.promptDraft) this.promptDraft = window.researchDB.getPromptSettings();

    this.promptDraft.systemPrompt = document.getElementById("prompt-system-input")?.value || "";
    this.promptDraft.keywordPrompt = document.getElementById("prompt-keyword-input")?.value || "";
    this.promptDraft.threeLinePrompt = document.getElementById("prompt-threeline-input")?.value || "";
    this.promptDraft.summaryPrompt = document.getElementById("prompt-summary-input")?.value || "";

    const explainInputVal = document.getElementById("prompt-explain-input")?.value || "";
    if (this.activeExplainScope === "all") {
      this.promptDraft.explainPrompt = explainInputVal;
    } else {
      if (!this.promptDraft.explainSubPrompts) this.promptDraft.explainSubPrompts = {};
      this.promptDraft.explainSubPrompts[this.activeExplainScope] = explainInputVal;
    }

    window.researchDB.savePromptSettings(this.promptDraft);
    this.syncExplainScopeUI();

    const saveBtn = document.getElementById("set-prompts-save-btn");
    if (saveBtn) {
      saveBtn.textContent = "저장됨 ✓";
      saveBtn.className =
        "px-7 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold transition shadow-sm";
      setTimeout(() => {
        if (saveBtn.textContent === "저장됨 ✓") {
          saveBtn.textContent = "저장";
          saveBtn.className =
            "px-7 py-2.5 rounded-xl bg-[#787f8a] hover:bg-[#5850ec] text-white text-sm font-bold transition shadow-sm";
        }
      }, 1600);
    }

    if (this.currentPaper) {
      this.localizePaperInBackground(this.currentPaper);
    }
  }

  // ================= MARKDOWN + CLICK-TO-COPY KATEX + ESCAPE HELPERS =================
  copyFormattedMath(encodedRawLatex, isDisplayMode = false, event = null) {
    if (event) event.stopPropagation();
    const raw = decodeURIComponent(encodedRawLatex || "");
    const formatted = window.moonlightAI
      ? window.moonlightAI.formatLatexWithDelimiter(raw, isDisplayMode)
      : raw;
    navigator.clipboard?.writeText(formatted);
    const delimName = window.researchDB?.getAppSettings()?.mathDelimiter || "bracket";
    this.showFloatingCard(
      `📐 수식 복사 완료 (${delimName})`,
      `<p>선택하신 수학 구분 기호 형식(<strong>${this.escapeHtml(delimName)}</strong>)으로 클립보드에 복사되었습니다:</p>
       <pre class="mt-2 p-2.5 rounded-xl bg-zinc-900 text-emerald-300 font-mono text-xs overflow-x-auto">${this.escapeHtml(formatted)}</pre>`
    );
  }

  renderLatexToString(latex, displayMode = false) {
    const encodedRaw = encodeURIComponent(latex || "");
    if (window.katex) {
      try {
        const rendered = window.katex.renderToString(latex, { displayMode, throwOnError: false });
        return `<span onclick="app.copyFormattedMath('${encodedRaw}', ${Boolean(displayMode)}, event)" class="katex-copyable" title="클릭하여 설정된 수학 구분 기호 형식으로 복사">${rendered}</span>`;
      } catch (_) {
        return `<code>${this.escapeHtml(latex)}</code>`;
      }
    }
    return `<code>${this.escapeHtml(latex)}</code>`;
  }

  renderMarkdownWithMath(mdText) {
    if (!mdText) return "";
    const mathBlocks = [];
    let processed = mdText.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const idx = mathBlocks.length;
      mathBlocks.push(this.renderLatexToString(tex.trim(), true));
      return `@@MATH_BLOCK_${idx}@@`;
    });

    processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
      const idx = mathBlocks.length;
      mathBlocks.push(this.renderLatexToString(tex.trim(), false));
      return `@@MATH_BLOCK_${idx}@@`;
    });

    let html = window.marked ? window.marked.parse(processed) : processed;
    html = html.replace(/@@MATH_BLOCK_(\d+)@@/g, (_, idx) => mathBlocks[Number(idx)] || "");
    return html;
  }

  escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  escapeAttr(str) {
    return String(str || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new MoonlightApp();
});
