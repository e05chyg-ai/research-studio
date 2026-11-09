// Custom AI Research Platform — Persistent IndexedDB, Settings & Prompt Personalization Storage Engine

class ResearchStorageDB {
  constructor() {
    this.dbName = "ResearchStudioCleanDB";
    this.dbVersion = 1;
    this.db = null;
    this.brandConfigKey = "research_studio_brand_clean_v1";
    this.activityKey = "research_studio_activity_clean_v1";
    this.appSettingsKey = "research_studio_app_settings_v1";
    this.sessionAutoOpenKey = "research_studio_auto_open_session_v1";
    this.promptSettingsKey = "research_studio_prompt_settings_v1";
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("uploaded_pdfs")) {
          db.createObjectStore("uploaded_pdfs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("annotations")) {
          db.createObjectStore("annotations", { keyPath: "paperId" });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ================= WHITE-LABEL BRAND CUSTOMIZATION =================
  getBrandConfig() {
    try {
      const raw = localStorage.getItem(this.brandConfigKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      appName: "Research Studio",
      subLabel: "AI Paper Reader",
      userName: "Guest",
      themePreset: "indigo",
      planBadge: "Workspace"
    };
  }

  saveBrandConfig(config) {
    const merged = { ...this.getBrandConfig(), ...config };
    localStorage.setItem(this.brandConfigKey, JSON.stringify(merged));
    return merged;
  }

  // ================= MOONLIGHT SETTINGS (기본 설정 & 화면 설정) =================
  getDefaultAppSettings() {
    return {
      // 기본 설정
      autoOpenPdf: false,
      autoOpenPeriod: "session", // 'session' (지금 읽는 동안만) | 'always' (앞으로 계속)
      language: "ko", // 'ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'de', 'fr'
      aiModel: "gemini-3.1-flash-lite",
      geminiApiKey: "",
      openaiApiKey: "",
      claudeApiKey: "",
      deepseekApiKey: "",
      verifiedApis: { gemini: false, openai: false, claude: false },
      // 화면 설정
      lightMode: !document.documentElement.classList.contains("dark"),
      fontSizePx: 16,
      separatePageTransFontSize: true,
      pageTransFontSizePx: 16,
      mathDelimiter: "bracket" // 'bracket' | 'dollar' | 'none'
    };
  }

  getAppSettings() {
    const defaults = this.getDefaultAppSettings();
    let stored = {};
    try {
      const raw = localStorage.getItem(this.appSettingsKey);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}

    const merged = { ...defaults, ...stored };

    // Resolve autoOpenPdf based on period ('session' vs 'always')
    if (merged.autoOpenPeriod === "session") {
      merged.autoOpenPdf = sessionStorage.getItem(this.sessionAutoOpenKey) === "true";
    } else {
      merged.autoOpenPdf = Boolean(stored.autoOpenPdf);
    }

    return merged;
  }

  saveAppSettings(partial) {
    const current = this.getAppSettings();
    const next = { ...current, ...partial };

    if (next.autoOpenPeriod === "session") {
      if (next.autoOpenPdf) {
        sessionStorage.setItem(this.sessionAutoOpenKey, "true");
      } else {
        sessionStorage.removeItem(this.sessionAutoOpenKey);
      }
      // Do not persist true in localStorage when mode is 'session' so closing browser resets it
      const toPersist = { ...next, autoOpenPdf: false };
      localStorage.setItem(this.appSettingsKey, JSON.stringify(toPersist));
    } else {
      sessionStorage.removeItem(this.sessionAutoOpenKey);
      localStorage.setItem(this.appSettingsKey, JSON.stringify(next));
    }

    return next;
  }

  // ================= PROMPT PERSONALIZATION (프롬프트 개인화) =================
  getDefaultPromptSettings() {
    return {
      systemPrompt: "",
      explainPrompt: "",
      explainSubPrompts: {
        formula: "",
        figure: "",
        paragraph: "",
        sentence: ""
      },
      keywordPrompt: "",
      threeLinePrompt: "",
      summaryPrompt: ""
    };
  }

  getPromptSettings() {
    const defaults = this.getDefaultPromptSettings();
    try {
      const raw = localStorage.getItem(this.promptSettingsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...defaults,
          ...parsed,
          explainSubPrompts: {
            ...defaults.explainSubPrompts,
            ...(parsed.explainSubPrompts || {})
          }
        };
      }
    } catch (_) {}
    return defaults;
  }

  savePromptSettings(partial) {
    const current = this.getPromptSettings();
    const merged = {
      ...current,
      ...partial,
      explainSubPrompts: {
        ...current.explainSubPrompts,
        ...(partial.explainSubPrompts || {})
      }
    };
    localStorage.setItem(this.promptSettingsKey, JSON.stringify(merged));
    return merged;
  }

  // ================= PERSISTENT PDF BINARY & METADATA STORAGE =================
  async saveUploadedPaper(paperMeta, pdfArrayBuffer) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("uploaded_pdfs", "readwrite");
      const store = tx.objectStore("uploaded_pdfs");
      store.put({
        id: paperMeta.id,
        meta: paperMeta,
        pdfBytes: pdfArrayBuffer,
        savedAt: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async updateUploadedPaperMeta(paperMeta) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("uploaded_pdfs", "readwrite");
      const store = tx.objectStore("uploaded_pdfs");
      const getReq = store.get(paperMeta.id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          existing.meta = paperMeta;
          store.put(existing);
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllUploadedPapers() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("uploaded_pdfs", "readonly");
      const store = tx.objectStore("uploaded_pdfs");
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        resolve(items);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getUploadedPdfBytes(paperId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("uploaded_pdfs", "readonly");
      const req = tx.objectStore("uploaded_pdfs").get(paperId);
      req.onsuccess = () => resolve(req.result ? req.result.pdfBytes : null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteUploadedPaper(paperId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("uploaded_pdfs", "readwrite");
      tx.objectStore("uploaded_pdfs").delete(paperId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ================= MY ACTIVITY TIMELINE =================
  getActivities(paperId = null) {
    try {
      const all = JSON.parse(localStorage.getItem(this.activityKey) || "[]");
      return paperId ? all.filter((a) => a.paperId === paperId) : all;
    } catch (_) {
      return [];
    }
  }

  logActivity(entry) {
    const all = this.getActivities(null);
    const item = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      ...entry
    };
    all.unshift(item);
    localStorage.setItem(this.activityKey, JSON.stringify(all.slice(0, 200)));
    return item;
  }

  deleteActivity(actId) {
    const all = this.getActivities(null).filter((a) => a.id !== actId);
    localStorage.setItem(this.activityKey, JSON.stringify(all));
  }

  // ================= FACTORY RESET (CLEAR ALL LOCAL DATA) =================
  async resetAllUserData() {
    localStorage.removeItem(this.brandConfigKey);
    localStorage.removeItem(this.activityKey);
    localStorage.removeItem(this.appSettingsKey);
    localStorage.removeItem(this.promptSettingsKey);
    sessionStorage.removeItem(this.sessionAutoOpenKey);
    localStorage.removeItem("research_studio_user_notes_clean_v1");
    localStorage.removeItem("research_studio_gemini_key");
    localStorage.removeItem("research_studio_gemini_model");

    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(["uploaded_pdfs", "annotations"], "readwrite");
      tx.objectStore("uploaded_pdfs").clear();
      tx.objectStore("annotations").clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

window.researchDB = new ResearchStorageDB();
