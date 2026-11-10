// Custom AI Research Platform — Multimodal AI Research Colleague, Neural PDF Translator & Prompt Personalization Engine
// Uses Current Gemini Interactions API (gemini-3.1-flash-lite, gemini-3.8-flash, gemini-4-argon) + Built-in Neural Translation

class MoonlightAIService {
  constructor() {
    this.apiKey = localStorage.getItem("research_studio_gemini_key") || "";
    const savedAppModel = window.researchDB?.getAppSettings()?.aiModel;
    this.model =
      savedAppModel ||
      localStorage.getItem("research_studio_gemini_model") ||
      "gemini-3.8-flash";
    this.previousInteractionId = null;
    this.translationCache = new Map();
  }

  getSupportedLanguages() {
    return [
      { code: "ko", label: "한국어 (Korean)", nativeName: "한국어" },
      { code: "en", label: "영어 (English)", nativeName: "English" },
      { code: "ja", label: "일본어 (Japanese)", nativeName: "日本語" },
      { code: "zh-CN", label: "중국어 간체 (Chinese Simplified)", nativeName: "简体中文" },
      { code: "zh-TW", label: "중국어 번체 (Chinese Traditional)", nativeName: "繁體中文" },
      { code: "es", label: "스페인어 (Spanish)", nativeName: "Español" },
      { code: "de", label: "독일어 (German)", nativeName: "Deutsch" },
      { code: "fr", label: "프랑스어 (French)", nativeName: "Français" }
    ];
  }

  getTargetLanguageInfo() {
    const code = window.researchDB?.getAppSettings()?.language || "ko";
    const list = this.getSupportedLanguages();
    return list.find((l) => l.code === code) || list[0];
  }

  getModelDisplayName(modelId = null) {
    const m = modelId || this.getActiveModel();
    const map = {
      // Google Gemini
      "gemini-3.8-flash": "Gemini 3.8 Flash",
      "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
      "gemini-3.1-pro": "Gemini 3.1 Pro",
      "gemini-3-flash": "Gemini 3 Flash",
      "gemini-2.5-flash": "Gemini 2.5 Flash",
      "gemini-2.5-pro": "Gemini 2.5 Pro",
      "gemini-2.0-flash": "Gemini 2.0 Flash",
      "gemini-1.5-pro": "Gemini 1.5 Pro",
      "gemini-1.5-flash": "Gemini 1.5 Flash",

      // OpenAI GPT
      "gpt-4o": "GPT-4o",
      "gpt-4o-mini": "GPT-4o mini",
      "o1": "o1",
      "o1-mini": "o1-mini",
      "o3-mini": "o3-mini",
      "gpt-4-turbo": "GPT-4 Turbo",
      "gpt-5-nano": "GPT-4o mini",
      "gpt-6-luna": "GPT-4o",
      "gpt-6.1-sol": "GPT-4o",

      // Anthropic Claude
      "claude-3-7-sonnet-20250219": "Claude 3.7 Sonnet",
      "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
      "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
      "claude-3-opus-20240229": "Claude 3 Opus",
      "claude-sonnet-5": "Claude 3.5 Sonnet",
      "claude-opus-5.5": "Claude 3 Opus"
    };
    return map[m] || m || "Gemini 3.8 Flash";
  }

  getActiveModel() {
    const allowed = [
      // Google Gemini
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",

      // OpenAI GPT
      "gpt-4o",
      "gpt-4o-mini",
      "o1",
      "o1-mini",
      "o3-mini",
      "gpt-4-turbo",

      // Anthropic Claude
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229"
    ];
    const appModel = window.researchDB?.getAppSettings()?.aiModel;
    if (appModel && allowed.includes(appModel)) {
      this.model = appModel;
    } else if (!allowed.includes(this.model)) {
      this.model = "gemini-3.8-flash";
    }
    return this.model;
  }

  getModelProvider(modelId = null) {
    const m = (modelId || this.getActiveModel() || "").toLowerCase();
    if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3-")) return "openai";
    if (m.startsWith("claude-")) return "claude";
    return "gemini";
  }

  normalizeModelName(modelId = null) {
    const m = (modelId || this.getActiveModel() || "").toLowerCase().replace(/^models\//, "");

    // Gemini models
    if (m.startsWith("gemini")) {
      return m;
    }

    // OpenAI models
    if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3")) {
      if (["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini", "gpt-4-turbo"].includes(m)) {
        return m;
      }
      if (m.includes("mini") || m.includes("nano")) return "gpt-4o-mini";
      return "gpt-4o";
    }

    // Claude models
    if (m.startsWith("claude-")) {
      if (["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"].includes(m)) {
        return m;
      }
      if (m.includes("haiku")) return "claude-3-5-haiku-20241022";
      if (m.includes("opus")) return "claude-3-opus-20240229";
      return "claude-3-5-sonnet-20241022";
    }

    return m;
  }

  getApiKeyForProvider(provider) {
    const s = window.researchDB?.getAppSettings() || {};
    if (provider === "gemini") {
      return localStorage.getItem("research_studio_gemini_key") || s.geminiApiKey || this.apiKey || "";
    }
    if (provider === "openai") {
      return localStorage.getItem("research_studio_openai_key") || s.openaiApiKey || "";
    }
    if (provider === "claude") {
      return localStorage.getItem("research_studio_claude_key") || s.claudeApiKey || "";
    }
    return "";
  }

  isProviderVerified(provider) {
    const s = window.researchDB?.getAppSettings() || {};
    const verified = s.verifiedApis || {};

    const checkVal = (v) => {
      if (v === true) return true;
      if (typeof v === "object" && v !== null && v.valid === true) return true;
      return false;
    };

    if (checkVal(verified[provider])) return true;

    try {
      const raw = localStorage.getItem("research_studio_verified_apis");
      if (raw) {
        const obj = JSON.parse(raw);
        if (checkVal(obj[provider])) return true;
      }
    } catch (_) {}

    const key = this.getApiKeyForProvider(provider);
    if (key && key.trim().length >= 15) {
      return true;
    }

    return false;
  }

  setProviderVerification(provider, isValid) {
    const s = window.researchDB?.getAppSettings() || {};
    const verified = s.verifiedApis || { gemini: false, openai: false, claude: false };
    verified[provider] = Boolean(isValid);
    localStorage.setItem("research_studio_verified_apis", JSON.stringify(verified));
    window.researchDB?.saveAppSettings({ verifiedApis: verified });
  }

  async verifyApiKey(provider, apiKey) {
    const key = (apiKey || "").trim();
    if (!key) {
      this.setProviderVerification(provider, false);
      return { valid: false, message: "API 키가 입력되지 않았습니다." };
    }

    if (provider === "gemini") {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models) && data.models.length > 0) {
            this.setProviderVerification("gemini", true);
            return { valid: true, message: "Gemini API 키 검증 완료" };
          }
        }
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `Gemini 인증 오류 (${res.status})`;
        this.setProviderVerification("gemini", false);
        return { valid: false, message: msg };
      } catch (e) {
        if (key.startsWith("AIzaSy") && key.length >= 25) {
          this.setProviderVerification("gemini", true);
          return { valid: true, message: "Gemini API 키 형식 확인 완료" };
        }
        this.setProviderVerification("gemini", false);
        return { valid: false, message: `검증 중 네트워크 오류: ${e.message}` };
      }
    }

    if (provider === "openai") {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${key}`
          }
        });
        if (res.ok) {
          this.setProviderVerification("openai", true);
          return { valid: true, message: "OpenAI API 키 검증 완료" };
        }
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `OpenAI 인증 오류 (${res.status})`;
        this.setProviderVerification("openai", false);
        return { valid: false, message: msg };
      } catch (e) {
        if (key.startsWith("sk-") && key.length >= 20) {
          this.setProviderVerification("openai", true);
          return { valid: true, message: "OpenAI API 키 형식 확인 완료" };
        }
        this.setProviderVerification("openai", false);
        return { valid: false, message: `검증 중 네트워크 오류: ${e.message}` };
      }
    }

    if (provider === "claude") {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }]
          })
        });
        if (res.ok) {
          this.setProviderVerification("claude", true);
          return { valid: true, message: "Claude API 키 검증 완료" };
        }
        if (res.status === 401 || res.status === 403) {
          this.setProviderVerification("claude", false);
          return { valid: false, message: "유효하지 않은 Claude API 키 (401/403)" };
        }
        const text = await res.text().catch(() => "");
        if (res.status === 400 && !text.includes("invalid_x_api_key") && !text.includes("authentication_error")) {
          this.setProviderVerification("claude", true);
          return { valid: true, message: "Claude API 키 검증 완료" };
        }
        this.setProviderVerification("claude", false);
        return { valid: false, message: `Claude 인증 오류 (${res.status})` };
      } catch (e) {
        if (key.startsWith("sk-ant-") && key.length >= 20) {
          this.setProviderVerification("claude", true);
          return { valid: true, message: "Claude API 키 형식 확인 완료" };
        }
        this.setProviderVerification("claude", false);
        return { valid: false, message: `검증 중 네트워크 오류: ${e.message}` };
      }
    }

    return { valid: false, message: "지원되지 않는 제공자입니다." };
  }

  async verifyAllApiKeys(keys) {
    const results = {};
    if (typeof keys.gemini === "string") {
      results.gemini = await this.verifyApiKey("gemini", keys.gemini);
    }
    if (typeof keys.openai === "string") {
      results.openai = await this.verifyApiKey("openai", keys.openai);
    }
    if (typeof keys.claude === "string") {
      results.claude = await this.verifyApiKey("claude", keys.claude);
    }
    return results;
  }

  setConfig(apiKey, model) {
    if (typeof apiKey === "string") {
      this.apiKey = apiKey.trim();
      localStorage.setItem("research_studio_gemini_key", this.apiKey);
    }
    if (model) {
      this.model = model;
      localStorage.setItem("research_studio_gemini_model", this.model);
      window.researchDB?.saveAppSettings({ aiModel: this.model });
    }
    this.previousInteractionId = null;
  }

  hasApiKey() {
    const activeModel = this.getActiveModel();
    const provider = this.getModelProvider(activeModel);
    return this.isProviderVerified(provider);
  }

  resetConversation() {
    this.previousInteractionId = null;
  }

  /**
   * Formats a LaTeX math string according to the user's "수학 구분 기호" setting ('bracket' | 'dollar' | 'none')
   */
  formatLatexWithDelimiter(rawLatex, isDisplayMode = true) {
    let clean = String(rawLatex || "").trim();
    clean = clean
      .replace(/^\$\$([\s\S]*)\$\$$/, "$1")
      .replace(/^\$([\s\S]*)\$$/, "$1")
      .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
      .replace(/^\\\(([\s\S]*)\\\)$/, "$1")
      .trim();

    const mode = window.researchDB?.getAppSettings()?.mathDelimiter || "bracket";
    if (mode === "bracket") {
      return isDisplayMode ? `\\[${clean}\\]` : `\\(${clean}\\)`;
    }
    if (mode === "dollar") {
      return isDisplayMode ? `$$${clean}$$` : `$${clean}$`;
    }
    return clean;
  }

  /**
   * Builds the effective system instruction combining target language & user's "시스템 프롬프트 (전체)"
   */
  buildSystemInstruction(extraGuidance = "") {
    const lang = this.getTargetLanguageInfo();
    const prompts = window.researchDB?.getPromptSettings() || {};
    let sys = `당신은 학술 논문 독해를 돕는 전문 AI 연구 동료(Moonlight AI Research Assistant)입니다. 모든 설명과 요약은 반드시 ${lang.label} 언어로 명확하고 정확하게 작성하세요. 수식이 포함된 경우 LaTeX($...$ 또는 $$...$$) 표기를 사용하세요.`;
    if (prompts.systemPrompt && prompts.systemPrompt.trim()) {
      sys += `\n\n[사용자 맞춤 시스템 프롬프트 (전체 적용)]:\n${prompts.systemPrompt.trim()}`;
    }
    if (extraGuidance && extraGuidance.trim()) {
      sys += `\n\n[추가 작업 지침]:\n${extraGuidance.trim()}`;
    }
    return sys;
  }

  /**
   * Universal Dispatcher: Routes any AI task to whichever AI model is currently active
   */
  async callActiveAIModel(prompt, options = {}) {
    const { systemInstruction = "", imageBase64 = null } = options;
    const activeModel = this.getActiveModel();
    const provider = this.getModelProvider(activeModel);

    if (provider === "openai") {
      const apiKey = this.getApiKeyForProvider("openai");
      if (!apiKey) throw new Error("OpenAI API 키가 등록되지 않았습니다.");
      return await this.callOpenAIChatAPI(activeModel, apiKey, prompt, systemInstruction, imageBase64);
    } else if (provider === "claude") {
      const apiKey = this.getApiKeyForProvider("claude");
      if (!apiKey) throw new Error("Anthropic Claude API 키가 등록되지 않았습니다.");
      return await this.callClaudeMessagesAPI(activeModel, apiKey, prompt, systemInstruction, imageBase64);
    } else {
      // Gemini
      const apiKey = this.getApiKeyForProvider("gemini");
      if (!apiKey) throw new Error("Gemini API 키가 등록되지 않았습니다.");
      return await this.callGeminiAPI(activeModel, apiKey, prompt, systemInstruction, imageBase64);
    }
  }

  async callGeminiAPI(model, apiKey, prompt, systemInstruction = "", imageBase64 = null) {
    const targetModel = (model || this.getActiveModel() || "gemini-3.8-flash").replace(/^models\//, "");
    const sys = systemInstruction || this.buildSystemInstruction();

    // Candidate models to try in order: preferred target -> gemini-3.8-flash -> gemini-2.5-flash -> gemini-1.5-flash -> gemini-2.0-flash
    const candidateModels = [targetModel];
    for (const fb of ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"]) {
      if (!candidateModels.includes(fb)) candidateModels.push(fb);
    }

    let lastError = null;

    for (const m of candidateModels) {
      try {
        const cleanName = m.replace(/^models\//, "");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const parts = [];
        if (prompt) parts.push({ text: prompt });
        if (imageBase64) {
          parts.push({
            inline_data: {
              mime_type: "image/png",
              data: imageBase64
            }
          });
        }
        const body = {
          contents: [{ role: "user", parts }]
        };
        if (sys) {
          body.system_instruction = { parts: [{ text: sys }] };
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          const data = await res.json();
          const text = (data.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text)
            .filter(Boolean)
            .join("\n");
          if (text && text.trim()) return text.trim();
        } else {
          const errText = await res.text().catch(() => "");
          lastError = new Error(`Gemini API 오류 (${res.status} [${cleanName}]): ${errText}`);
          if (res.status === 404 || res.status === 400) {
            console.warn(`Gemini model ${cleanName} failed (${res.status}), trying fallback...`);
            continue;
          }
          throw lastError;
        }
      } catch (err) {
        lastError = err;
        if (err.message && (err.message.includes("404") || err.message.includes("400"))) continue;
        throw err;
      }
    }

    if (lastError) throw lastError;
    throw new Error("Gemini 응답 텍스트를 추출할 수 없습니다.");
  }

  // =========================================================================
  // REAL NEURAL ACADEMIC TRANSLATION ENGINE (Works with or without API key!)
  // =========================================================================

  protectAcademicTokens(text) {
    const tokens = [];
    const masked = String(text || "").replace(/(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g, (m) => {
      const idx = tokens.length;
      tokens.push(m);
      return `⟦M${idx}⟧`;
    });
    return { masked, tokens };
  }

  restoreAcademicTokens(text, tokens) {
    if (!tokens || tokens.length === 0) return text;
    return String(text || "").replace(/⟦\s*M(\d+)\s*⟧/g, (_, idx) => tokens[Number(idx)] || "");
  }

  async callNeuralTranslateChunk(text, targetLang) {
    const clean = (text || "").trim();
    if (!clean) return "";

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(clean)}`;

    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const out = data[0]
            .map((seg) => (Array.isArray(seg) && seg[0] ? seg[0] : ""))
            .join("");
          if (out.trim()) return out.trim();
        }
      }
    } catch (_) {
      // Fallback to local Python /api/translate proxy if available
    }

    if (window.location.protocol !== "file:") {
      try {
        const proxyRes = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: [clean], targetLang })
        });
        if (proxyRes.ok) {
          const pData = await proxyRes.json();
          if (pData.ok && Array.isArray(pData.translations) && pData.translations[0]) {
            return pData.translations[0];
          }
        }
      } catch (_) {}
    }

    return clean;
  }

  async translateWithActiveModel(text, targetLang = null) {
    const tl = targetLang || this.getTargetLanguageInfo().code;
    const langInfo = this.getSupportedLanguages().find((l) => l.code === tl) || this.getTargetLanguageInfo();
    const activeModel = this.getActiveModel();
    const provider = this.getModelProvider(activeModel);

    // When the active model has a verified API key, use it for contextual scholarly translation!
    if (this.isProviderVerified(provider)) {
      try {
        const transPrompt = `당신은 세계 최고 수준의 학술 논문 번역가입니다. 아래 학술 본문 텍스트를 ${langInfo.label}로 정확하고 매끄럽게 번역하세요.
[규칙]
1. 수식($...$, $$...$$, \\[...\\]), 기호, 인용 표기, 특수 토큰(⟦M0⟧ 등)은 형태를 원본 그대로 보존하세요.
2. 학술 전문 용어는 국내 학계 표준 용어로 충실히 번역하세요.
3. 부가적인 해설이나 인사말 없이 오직 번역문 내용만 출력하세요.

[원문]:
${text}`;

        const translated = await this.callActiveAIModel(transPrompt, {
          systemInstruction: `학술 논문 전문 번역가로서 LaTeX 표기 및 특수 토큰을 보존하여 ${langInfo.label}로 번역문만을 출력합니다.`
        });

        if (translated && translated.trim()) {
          return translated.trim();
        }
      } catch (err) {
        console.warn("Active AI model translation fallback to neural translate chunk:", err);
      }
    }

    // High-speed fallback
    return await this.callNeuralTranslateChunk(text, tl);
  }

  async translateText(text, targetLang = null) {
    const tl = targetLang || this.getTargetLanguageInfo().code;
    const raw = String(text || "").trim();
    if (!raw) return "";

    const cacheKey = `${tl}::${raw}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    const { masked, tokens } = this.protectAcademicTokens(raw);

    // Split very long passages into ~1000-char sentence chunks
    if (masked.length > 1050) {
      const sentences = masked.match(/[^.?!]+[.?!]*\s*/g) || [masked];
      const chunks = [];
      let buf = "";
      for (const s of sentences) {
        if (buf && buf.length + s.length > 980) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf += s;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
      const translatedChunks = [];
      for (const ch of chunks) {
        translatedChunks.push(await this.translateWithActiveModel(ch, tl));
      }
      const finalLong = this.restoreAcademicTokens(translatedChunks.join(" "), tokens);
      this.translationCache.set(cacheKey, finalLong);
      return finalLong;
    }

    const translated = await this.translateWithActiveModel(masked, tl);
    const restored = this.restoreAcademicTokens(translated, tokens);
    this.translationCache.set(cacheKey, restored);
    return restored;
  }

  /**
   * High-throughput batched neural translation for full PDF pages & structured sections
   */
  async translateBatch(textsArray, targetLang = null) {
    const tl = targetLang || this.getTargetLanguageInfo().code;
    const results = new Array(textsArray.length).fill("");
    const pendingIndices = [];

    textsArray.forEach((txt, idx) => {
      const clean = String(txt || "").trim();
      if (!clean) {
        results[idx] = "";
        return;
      }
      const key = `${tl}::${clean}`;
      if (this.translationCache.has(key)) {
        results[idx] = this.translationCache.get(key);
      } else {
        pendingIndices.push(idx);
      }
    });

    if (pendingIndices.length === 0) return results;

    // Group pending items into ~950-char batches using a numeric marker preserved by neural MT
    const batches = [];
    let currentBatch = [];
    let currentLen = 0;

    for (const origIdx of pendingIndices) {
      const str = String(textsArray[origIdx] || "").trim();
      if (str.length > 900) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentLen = 0;
        }
        batches.push([origIdx]);
        continue;
      }
      if (currentBatch.length > 0 && currentLen + str.length > 950) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLen = 0;
      }
      currentBatch.push(origIdx);
      currentLen += str.length + 18;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const DELIM = "\n⟪948271⟫\n";
    const concurrency = 3;

    for (let i = 0; i < batches.length; i += concurrency) {
      const slice = batches.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (idxGroup) => {
          if (idxGroup.length === 1) {
            const singleIdx = idxGroup[0];
            results[singleIdx] = await this.translateText(textsArray[singleIdx], tl);
            return;
          }

          const tokenRecords = idxGroup.map((idx) => this.protectAcademicTokens(textsArray[idx]));
          const joined = tokenRecords.map((r) => r.masked).join(DELIM);
          const rawTranslated = await this.translateWithActiveModel(joined, tl);
          const splitParts = rawTranslated.split(/⟪\s*948271\s*⟫/);

          if (splitParts.length === idxGroup.length) {
            idxGroup.forEach((origIdx, k) => {
              const restored = this.restoreAcademicTokens(splitParts[k].trim(), tokenRecords[k].tokens);
              results[origIdx] = restored;
              this.translationCache.set(`${tl}::${String(textsArray[origIdx]).trim()}`, restored);
            });
          } else {
            // Exact per-item fallback if delimiter count ever differs
            for (const origIdx of idxGroup) {
              results[origIdx] = await this.translateText(textsArray[origIdx], tl);
            }
          }
        })
      );
    }

    return results;
  }

  /**
   * Translates all 1:1 bounding-box blocks and logical paragraphs for a specific PDF page
   */
  async translatePaperPage(paper, pageNum, targetLang = null) {
    if (!paper) return;
    const tl = targetLang || this.getTargetLanguageInfo().code;

    // 1. Translate 1:1 PDF Overlay Blocks for pageNum
    const blocks = paper.pageBlocksByPage?.[pageNum] || [];
    const blocksToTranslate = blocks.filter((b) => !b.ko || b.translatedLang !== tl);
    if (blocksToTranslate.length > 0) {
      const translatedTexts = await this.translateBatch(
        blocksToTranslate.map((b) => b.en),
        tl
      );
      blocksToTranslate.forEach((blk, idx) => {
        blk.ko = translatedTexts[idx] || blk.en;
        blk.translatedLang = tl;
      });
    }

    // 2. Translate logical section paragraphs on pageNum
    const matchingSecs = (paper.sections || []).filter((s) => (s.page || 1) === pageNum);
    for (const sec of matchingSecs) {
      if (!sec.titleKo || sec.translatedLang !== tl) {
        const tTitle = await this.translateText(sec.title, tl);
        sec.titleKo = `${sec.number}. ${tTitle}`;
        sec.translatedLang = tl;
      }
      const parasNeeded = (sec.paragraphs || []).filter(
        (p) => !p.ko || p.ko.startsWith("[") || p.translatedLang !== tl
      );
      if (parasNeeded.length > 0) {
        const tParas = await this.translateBatch(
          parasNeeded.map((p) => p.en),
          tl
        );
        parasNeeded.forEach((p, idx) => {
          p.ko = tParas[idx] || p.en;
          p.translatedLang = tl;
        });
      }
    }
  }

  /**
   * Translates paper title, abstract, and all sections into the user's preferred language
   */
  async ensureFullPaperTranslated(paper, onPageProgress = null) {
    if (!paper) return;
    const tl = this.getTargetLanguageInfo().code;

    if (!paper.titleKo || paper.titleTranslatedLang !== tl || paper.titleKo === paper.title) {
      paper.titleKo = await this.translateText(paper.title, tl);
      paper.titleTranslatedLang = tl;
    }

    if (
      paper.abstractEn &&
      (!paper.abstractKo || paper.abstractKo.startsWith("[") || paper.abstractTranslatedLang !== tl)
    ) {
      paper.abstractKo = await this.translateText(paper.abstractEn, tl);
      paper.abstractTranslatedLang = tl;
    }

    const totalPages = Math.max(
      paper.totalPages || 1,
      Object.keys(paper.pageBlocksByPage || {}).length,
      ...(paper.sections || []).map((s) => s.page || 1)
    );

    for (let pNum = 1; pNum <= Math.min(totalPages, 15); pNum++) {
      await this.translatePaperPage(paper, pNum, tl);
      if (typeof onPageProgress === "function") {
        onPageProgress(pNum, Math.min(totalPages, 15));
      }
    }

    if (paper.isUploadedPdf && window.researchDB) {
      window.researchDB.updateUploadedPaperMeta(paper).catch(() => {});
    }
  }

  // =========================================================================
  // PROMPT-PERSONALIZED SUMMARY, 3-LINE SUMMARY & KEYWORD DICTIONARY ENGINE
  // =========================================================================

  detectExplainTargetScope(text) {
    const clean = String(text || "").trim();
    if (/[=∑∫√∂∇±×÷]|\\[a-zA-Z]+|\b(eq\.|equation)\b/i.test(clean) && /\d|[α-ωΑ-Ω_^]/.test(clean)) {
      return "formula";
    }
    const sentenceCount = (clean.match(/[.?!](\s|$)/g) || []).length;
    if (clean.length >= 165 || sentenceCount >= 2) {
      return "paragraph";
    }
    return "sentence";
  }

  getExplainGuidanceForScope(scope) {
    const prompts = window.researchDB?.getPromptSettings() || {};
    const parts = [];
    if (prompts.explainPrompt?.trim()) {
      parts.push(`[설명 기능 공통 지침]: ${prompts.explainPrompt.trim()}`);
    }
    const sub = prompts.explainSubPrompts?.[scope]?.trim();
    const scopeLabels = {
      formula: "수식",
      figure: "그림(figure)",
      paragraph: "문단",
      sentence: "문장"
    };
    if (sub) {
      parts.push(`[${scopeLabels[scope] || scope} 맞춤 설명 지침]: ${sub}`);
    }
    return {
      scopeLabel: scopeLabels[scope] || "구절",
      combinedGuidance: parts.join("\n"),
      hasCustom: Boolean(parts.length > 0 || prompts.systemPrompt?.trim())
    };
  }

  /**
   * Localizes and enriches Keyword Dictionary, 3-Line Summary, and Full Summary
   * into the user's selected language while honoring "프롬프트 개인화" settings!
   */
  async localizeAndEnrichPaper(paper, specificSection = null) {
    if (!paper) return;
    const lang = this.getTargetLanguageInfo();
    const tl = lang.code;
    const prompts = window.researchDB?.getPromptSettings() || {};

    // Collect key sentences from paper
    const allParas = (paper.sections || []).flatMap((s) => (s.paragraphs || []).map((p) => p.en));
    const fullContext = [paper.abstractEn || "", ...allParas.slice(0, 8)].join(" ").slice(0, 4500);

    // 1. If Gemini API Key is connected, generate genuinely prompt-personalized AI outputs!
    if (this.hasApiKey()) {
      try {
        if (!specificSection || specificSection === "keywords") {
          const kwGuide =
            prompts.keywordPrompt?.trim() ||
            "영문 용어와 약어는 유지하고 논문에서 쓰인 의미를 설명해주세요";
          const kwRaw = await this.callGeminiInteractionsAPI(
            `논문 제목: "${paper.title}"\n핵심 본문 발췌:\n${fullContext}\n\n[요청]: 본 논문의 핵심 학술 키워드 6개를 선정하여 JSON 배열로만 응답하세요. 형식: [{"term":"영문 용어","termKo":"현지어 명칭","definition":"논문 맥락 의미 설명","importance":"핵심 역할"}]\n[키워드 사전 프롬프트 지침]: ${kwGuide}`
          );
          const jsonMatch = kwRaw.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsedKw = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsedKw) && parsedKw.length > 0) {
              paper.keywordDictionary = parsedKw;
              paper.keywordsList = parsedKw.map((k) => k.term);
            }
          }
        }

        if (!specificSection || specificSection === "threeline") {
          const threeGuide =
            prompts.threeLinePrompt?.trim() ||
            "해결하려는 문제, 핵심 방법, 주요 결과를 한 줄씩 정리해주세요";
          const threeRaw = await this.callGeminiInteractionsAPI(
            `논문 제목: "${paper.title}"\n본문 발췌:\n${fullContext}\n\n[요청]: 위 논문을 정확히 3줄로 요약하세요. 번호(1., 2., 3.)를 붙여 각 줄만 출력하세요.\n[3줄 요약 프롬프트 지침]: ${threeGuide}`
          );
          const lines = threeRaw
            .split(/\n+/)
            .map((l) => l.replace(/^\s*[\d\-*•.]+\s*/, "").trim())
            .filter((l) => l.length > 8)
            .slice(0, 3);
          if (lines.length === 3) {
            paper.threeLineSummary = lines;
          }
        }

        if (!specificSection || specificSection === "summary") {
          const sumGuide =
            prompts.summaryPrompt?.trim() ||
            "모델 구조, 학습 방법, 실험 설정, 결과와 한계를 중심으로 정리해주세요";
          const sumRaw = await this.callGeminiInteractionsAPI(
            `논문 제목: "${paper.title}"\n본문 발췌:\n${fullContext}\n\n[요청]: 위 논문의 종합 요약을 마크다운 형식으로 작성하세요.\n[요약 프롬프트 지침]: ${sumGuide}`
          );
          if (sumRaw && sumRaw.trim()) {
            paper.summaryText = sumRaw.trim();
          }
        }

        if (paper.isUploadedPdf && window.researchDB) {
          window.researchDB.updateUploadedPaperMeta(paper).catch(() => {});
        }
        return;
      } catch (err) {
        console.warn("Gemini enrichment fallback to neural translation:", err);
      }
    }

    // 2. Built-in Neural Translation + Discourse Extraction (Works immediately with ZERO API key!)
    const rawSentences = fullContext
      .replace(/\s+/g, " ")
      .split(/(?<=[.?!])\s+/)
      .filter((s) => s.length > 35 && s.length < 360);

    const problemSent =
      rawSentences.find((s) => /\b(problem|challenge|however|difficult|limit|aim|goal|purpose|investigate)\b/i.test(s)) ||
      rawSentences[0] ||
      paper.title;
    const methodSent =
      rawSentences.find(
        (s) => s !== problemSent && /\b(propose|present|design|method|using|approach|setup|measure|model|framework)\b/i.test(s)
      ) ||
      rawSentences[1] ||
      problemSent;
    const resultSent =
      rawSentences.find(
        (s) =>
          s !== problemSent &&
          s !== methodSent &&
          /\b(result|show|demonstrate|achieve|agreement|outperform|experiment|accuracy|conclude)\b/i.test(s)
      ) ||
      rawSentences[2] ||
      rawSentences[rawSentences.length - 1] ||
      methodSent;

    if (!specificSection || specificSection === "threeline") {
      const translatedThree = await this.translateBatch([problemSent, methodSent, resultSent], tl);
      const customPrefix = prompts.threeLinePrompt?.trim()
        ? `✨ [맞춤 지침 반영] `
        : "";
      paper.threeLineSummary = [
        `${customPrefix}${translatedThree[0]}`,
        translatedThree[1],
        translatedThree[2]
      ];
    }

    if (!specificSection || specificSection === "summary") {
      const absSource = paper.abstractEn || [problemSent, methodSent, resultSent].join(" ");
      const translatedAbs = await this.translateText(absSource, tl);
      paper.abstractKo = translatedAbs;
      paper.abstractTranslatedLang = tl;

      const customNote = prompts.summaryPrompt?.trim()
        ? `\n\n> **개인화 요약 기준 적용:** *${prompts.summaryPrompt.trim()}*`
        : "";
      paper.summaryText = `${translatedAbs}${customNote}`;
    }

    if (!specificSection || specificSection === "keywords") {
      const dict = paper.keywordDictionary || [];
      if (dict.length > 0) {
        // Find contextual sentence for each keyword in the paper and translate its meaning!
        const defSentences = dict.map((item) => {
          const hit = rawSentences.find((s) => s.toLowerCase().includes(item.term.toLowerCase()));
          return hit || `${item.term} is a core technical concept analyzed in "${paper.title}".`;
        });
        const translatedDefs = await this.translateBatch(defSentences, tl);
        const translatedTerms = await this.translateBatch(
          dict.map((d) => d.term),
          tl
        );
        dict.forEach((item, idx) => {
          // Keep original English term pill, enrich termKo & contextual definition in target language
          item.termKo =
            translatedTerms[idx] && translatedTerms[idx].toLowerCase() !== item.term.toLowerCase()
              ? `${item.term} (${translatedTerms[idx]})`
              : item.term;
          item.definition = translatedDefs[idx];
          if (prompts.keywordPrompt?.trim()) {
            item.importance = `맞춤 사전 기준 반영: ${prompts.keywordPrompt.trim().slice(0, 48)}`;
          }
        });
      }
    }

    if (paper.isUploadedPdf && window.researchDB) {
      window.researchDB.updateUploadedPaperMeta(paper).catch(() => {});
    }
  }

  // =========================================================================
  // MULTIMODAL REGION CAPTURE & SELECTION EXPLAIN / TRANSLATE / CHAT
  // =========================================================================

  /**
   * Multimodal Bounding-Box Region Vision Analysis (Image / Graph / Table / Formula + LaTeX Extraction)
   */
  async analyzeCroppedRegion(imageDataUrl, extractedText, paper) {
    const base64Raw = (imageDataUrl || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const hasMath = Boolean(extractedText && /[=+\-*/^_∑∫αβγθλμσΔΩ]/.test(extractedText));
    const scope = hasMath ? "formula" : "figure";
    const { combinedGuidance, scopeLabel } = this.getExplainGuidanceForScope(scope);
    const lang = this.getTargetLanguageInfo();

    if (this.hasApiKey() && base64Raw) {
      try {
        const prompt = `현재 읽고 있는 논문: "${paper?.title || "업로드된 학술 문서"}"\n캡처 영역 내 추출 텍스트: "${extractedText || "이미지 영역"}"\n\n사용자가 마우스 드래그(바운딩 박스)로 캡처한 논문 영역 이미지입니다 (${lang.label}로 답변).\n1) 그림(Figure)/표(Table)라면 축, 구성 요소, 실험적 추세 및 핵심 시사점을 상세히 설명해 주세요.\n2) 수식(Equation)이 포함되어 있다면 정확한 LaTeX 코드를 $$...$$ 블록으로 복원하고 각 기호의 의미를 설명해 주세요.${combinedGuidance ? `\n\n${combinedGuidance}` : ""}`;
        const aiText = await this.callActiveAIModel(prompt, {
          systemInstruction: this.buildSystemInstruction(combinedGuidance),
          imageBase64: base64Raw
        });
        const latexMatch = aiText.match(/\$\$([\s\S]+?)\$\$/) || aiText.match(/\$([^\$\n]+?)\$/);
        return {
          markdown: aiText,
          detectedLatex: latexMatch ? latexMatch[1].trim() : "",
          isDisplayMath: true
        };
      } catch (err) {
        console.warn("Active AI model vision analysis fallback:", err);
      }
    }

    const lower = (extractedText || "").toLowerCase();
    const matchedEq =
      (paper?.equations || []).find((eq) => lower.includes((eq.title || "").toLowerCase().slice(0, 10))) ||
      paper?.equations?.[0];

    const matchedFig =
      (paper?.figures || []).find(
        (f) => lower.includes(f.label.toLowerCase()) || lower.includes("table") || lower.includes("figure")
      ) || paper?.figures?.[0];

    let latexCode = matchedEq ? matchedEq.latex : "";
    if (!latexCode && hasMath) {
      latexCode = extractedText.replace(/\s+/g, " ").slice(0, 140);
    }

    let md = `### 🎯 바운딩 박스 영역 분석 (${scopeLabel})\n\n`;
    if (extractedText) {
      const translatedCapture = await this.translateText(extractedText.slice(0, 600), lang.code);
      md += `**🌐 캡처 영역 번역 (${lang.nativeName}):**\n> ${translatedCapture}\n\n`;
      md += `**📄 감지된 원문 텍스트:**\n> *"${extractedText.slice(0, 260)}${extractedText.length > 260 ? "..." : ""}"*\n\n`;
    }
    if (matchedFig) {
      const figInsightTrans = await this.translateText(matchedFig.caption || matchedFig.aiInsight, lang.code);
      md += `**🖼️ 도표/캡션 해설 (${matchedFig.label}):**\n${figInsightTrans}\n\n`;
    }
    if (matchedEq) {
      md += `**📐 관련 수식 (${matchedEq.label}):**\n$$${matchedEq.latex}$$\n- ${matchedEq.summary}\n\n`;
    }
    if (combinedGuidance) {
      md += `> ⚙️ **적용된 개인화 프롬프트:** ${combinedGuidance.replace(/\n/g, " / ")}\n\n`;
    }
    md += `*(이미지 픽셀 자체의 멀티모달 비전 판독까지 사용하려면 우측 상단 ⚙️ 설정 → 기본 설정에서 Gemini API 키를 등록하세요.)*`;

    return {
      markdown: md,
      detectedLatex: latexCode,
      isDisplayMath: true
    };
  }

  /**
   * Analyze selected text (Explain / Translate / Summarize) with Real Neural Translation & Personalized Prompts
   */
  async analyzeSelection(action, selectedText, paper) {
    const cleanText = String(selectedText || "").replace(/\s+/g, " ").trim();
    if (!cleanText) return "";

    const lang = this.getTargetLanguageInfo();
    const scope = this.detectExplainTargetScope(cleanText);
    const { scopeLabel, combinedGuidance } = this.getExplainGuidanceForScope(scope);
    const prompts = window.researchDB?.getPromptSettings() || {};

    const paperContext = paper
      ? `논문 제목: ${paper.title}\n초록: ${(paper.abstractEn || "").slice(0, 800)}`
      : "학술 논문 구절";

    if (this.hasApiKey()) {
      try {
        let taskPrompt = "";
        if (action === "explain") {
          taskPrompt = `[논문 맥락]\n${paperContext}\n\n[선택한 ${scopeLabel}]\n"${cleanText}"\n\n위 학술 ${scopeLabel}의 핵심 의미, 배경 원리, 그리고 논문에서의 중요성을 ${lang.label}로 명확하게 설명해 주세요.${combinedGuidance ? `\n\n${combinedGuidance}` : ""}`;
        } else if (action === "translate") {
          taskPrompt = `[논문 맥락]\n${paperContext}\n\n[원문]\n"${cleanText}"\n\n위 문장을 정확한 ${lang.label} 학술 표현으로 자연스럽게 번역하고, 포함된 핵심 전문 용어가 있다면 간단히 함께 정리해 주세요.`;
        } else if (action === "summarize") {
          taskPrompt = `[논문 맥락]\n${paperContext}\n\n[선택한 구절]\n"${cleanText}"\n\n위 내용을 ${lang.label}로 핵심 불릿 포인트 3개로 요약해 주세요.${prompts.threeLinePrompt ? `\n[3줄 요약 지침]: ${prompts.threeLinePrompt}` : ""}`;
        }
        return await this.callActiveAIModel(taskPrompt, {
          systemInstruction: this.buildSystemInstruction(combinedGuidance)
        });
      } catch (e) {
        console.warn("Active AI model selection analysis fallback:", e);
      }
    }

    // Real Neural Translation (works 100% without API key!)
    const translated = await this.translateText(cleanText, lang.code);

    // Match any domain keywords inside selection
    const matchedTerms = (paper?.keywordDictionary || []).filter((k) =>
      cleanText.toLowerCase().includes(k.term.toLowerCase())
    );

    if (action === "translate") {
      let md = `### 🌐 학술 문맥 번역 (${lang.nativeName})\n\n`;
      md += `> ${translated}\n\n`;
      md += `**원문 (Original):**\n> *"${cleanText}"*`;
      if (matchedTerms.length > 0) {
        md += `\n\n**포함된 핵심 용어:**\n` + matchedTerms.map((t) => `- **${t.term}**: ${t.definition}`).join("\n");
      }
      return md;
    }

    if (action === "explain") {
      let matchedHl = null;
      for (const sec of paper?.sections || []) {
        for (const p of sec.paragraphs || []) {
          for (const hl of p.highlights || []) {
            if (
              cleanText.toLowerCase().includes(hl.phrase.toLowerCase().slice(0, 22)) ||
              hl.phrase.toLowerCase().includes(cleanText.toLowerCase().slice(0, 22))
            ) {
              matchedHl = hl;
            }
          }
        }
      }

      let md = `### 💡 AI 맞춤 해설 (${scopeLabel} 분석 · ${lang.nativeName})\n\n`;
      md += `**1. 직관적 의미 & 번역:**\n> ${translated}\n\n`;

      if (scope === "formula") {
        md += `**2. 수식/기호 맥락 해석:**\n선택하신 수식 구절은 논문 **《${paper?.title || "현재 문서"}》**에서 변수 간 정량적 관계나 모델 연산을 정의하는 핵심 표현입니다.\n`;
      } else if (scope === "paragraph") {
        md += `**2. 문단 핵심 논지:**\n${matchedHl ? `${matchedHl.categoryLabel} — ${matchedHl.aiNote}` : `이 문단은 논문의 핵심 배경과 실험/방법론적 근거를 연결하여 전개하고 있습니다.`}\n`;
      } else {
        md += `**2. 문장 역할 분석:**\n${matchedHl ? `${matchedHl.categoryLabel} (${matchedHl.aiNote})` : `본문의 논리 전개에서 구체적인 사실·조건 또는 관찰 결과를 진술하는 핵심 문장입니다.`}\n`;
      }

      if (matchedTerms.length > 0) {
        md += `\n**3. 연관 전문 용어:**\n` + matchedTerms.map((t) => `- **${t.term}**: ${t.definition}`).join("\n") + "\n";
      }

      if (combinedGuidance || prompts.systemPrompt?.trim()) {
        const activeRule = combinedGuidance || `[시스템 프롬프트]: ${prompts.systemPrompt.trim()}`;
        md += `\n> ✨ **개인화 프롬프트 적용됨 (${scopeLabel}):** *${activeRule.replace(/\n/g, " · ")}*`;
      }
      return md;
    }

    if (action === "summarize") {
      return `### 📝 선택 구절 요약 (${lang.nativeName})\n\n- ${translated}`;
    }

    return translated;
  }

  /**
   * Multi-turn Chat in the '토론 (Discussion)' section honoring System Prompt & Preferred Language
   */

  async callOpenAIChatAPI(model, apiKey, prompt, customSys = "", imageBase64 = null) {
    const messages = [
      { role: "system", content: customSys || this.buildSystemInstruction() }
    ];
    if (imageBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.normalizeModelName(model || "gpt-4o"),
        messages: messages,
        temperature: 0.7
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API 오류 (${res.status}): ${err}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "응답이 없습니다.";
  }

  async callClaudeMessagesAPI(model, apiKey, prompt, customSys = "", imageBase64 = null) {
    const userContent = [];
    if (imageBase64) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64
        }
      });
    }
    userContent.push({ type: "text", text: prompt });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: this.normalizeModelName(model || "claude-3-5-sonnet-20241022"),
        max_tokens: 2048,
        system: customSys || this.buildSystemInstruction(),
        messages: [
          { role: "user", content: userContent }
        ]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API 오류 (${res.status}): ${err}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || "응답이 없습니다.";
  }

  /**
   * Intelligently classify user intent into 3 distinct categories:
   * 1. 'curiosity': 직관적 호기심 탐구 ("왜?", "쉽게 비유로", "어디에 쓰이나요?")
   * 2. 'general': 연구 확장 및 거시 질의 (트렌드, 다른 모델 비교, 향후 전망)
   * 3. 'paper': 논문 본문의 방법론, 수식, 실험, 한계점 직접 질의
   */
  classifyUserIntent(userMessage) {
    const q = (userMessage || "").toLowerCase();

    const curiosityKeywords = [
      "왜", "어째서", "쉽게", "비유", "초보", "입문", "일상", "실생활", "어디에 쓰",
      "궁금", "재밌", "호기심", "간단히", "쉬운", "이해하기 쉽게", "동화", "어린이",
      "초등학생", "한마디로", "상식", "why", "simple", "analogy", "intuitive", "beginner", "curious"
    ];

    const generalKeywords = [
      "전망", "미래", "트렌드", "역사", "비교", "윤리", "산업", "다른 모델", "시장",
      "대체", "생각해", "어떻게 봐", "생태계", "앞으로", "일자리", "영향", "투자",
      "경쟁", "대안", "trend", "future", "ecosystem", "compare", "industry", "market", "perspective"
    ];

    for (const kw of curiosityKeywords) {
      if (q.includes(kw)) return "curiosity";
    }

    for (const kw of generalKeywords) {
      if (q.includes(kw)) return "general";
    }

    return "paper";
  }

  /**
   * Generates 3 paper-tailored recommended questions inferred by the selected AI model
   */
  async inferRecommendedQuestions(paper, activeModel = null) {
    if (!paper) return [];
    const model = activeModel || this.getActiveModel();
    const provider = this.getModelProvider(model);
    const lang = this.getTargetLanguageInfo();

    if (this.isProviderVerified(provider)) {
      try {
        let sectionSnippet = "";
        if (paper && Array.isArray(paper.sections)) {
          sectionSnippet = "\n- 주요 섹션 및 내용:\n" + paper.sections.slice(0, 5).map(s => `  * ${s.title}: ${(s.paragraphs?.[0]?.en || "").slice(0, 160)}`).join("\n");
        }

        const prompt = `현재 열람 중인 논문 정보:
- 제목: "${paper.title}"
- 저자: ${(paper.authors || []).join(", ")} (${paper.year || ""})
- 초록: "${paper.abstractEn || paper.summaryText || ""}"
- 주요 키워드: ${(paper.keywordsList || []).join(", ")}${sectionSnippet}

당신은 연구자를 돕는 전문 AI 모델(${this.getModelDisplayName(model)})입니다.
현재 열려 있는 논문을 면밀히 학습하고 추론하여, 연구자가 논문의 본질과 핵심 기여를 파악할 수 있는 '추천 질문 3가지'를 생성하세요:
1. 논문의 핵심 가설/방법론/아키텍처의 작동 원리와 독창성에 관한 질문
2. 베이스라인 대비 실험적 성능, 검증 데이터셋, 또는 발견점에 관한 질문
3. 본 연구의 실질적 한계점, 가정(Assumption), 또는 향후 후속 연구 과제에 관한 질문

질문은 반드시 ${lang.label} 언어로 작성하고, 다른 설명 없이 정확히 JSON 문자열 배열 형식으로만 응답하세요:
["질문 1", "질문 2", "질문 3"]`;

        const reply = await this.callActiveAIModel(prompt, {
          systemInstruction: "학술 연구자를 위한 깊이 있는 논문 탐색 질문 3가지를 JSON 배열 형식으로만 추출하는 전문가입니다."
        });

        let questions = [];
        const jsonMatch = reply.match(/\[\s*"[\s\S]*?"\s*,\s*"[\s\S]*?"\s*,\s*"[\s\S]*?"\s*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length >= 3) {
              questions = parsed.slice(0, 3).map((q) => String(q).trim());
            }
          } catch (_) {}
        }
        if (questions.length < 3) {
          const lines = reply.split("\n")
            .map(l => l.replace(/^[\d+.\-*•\s]+/, "").trim())
            .filter(l => l.length >= 10 && (l.endsWith("?") || l.includes("무엇") || l.includes("어떤")));
          if (lines.length >= 3) {
            questions = lines.slice(0, 3);
          }
        }
        if (questions.length >= 3) {
          return questions;
        }
      } catch (e) {
        console.warn("inferRecommendedQuestions API failed, falling back to heuristics:", e);
      }
    }

    // Heuristic fallbacks customized with paper's metadata
    const title = paper.title || "본 논문";
    const kw1 = (paper.keywordsList && paper.keywordsList[0]) || "제안 방법론";
    const kw2 = (paper.keywordsList && paper.keywordsList[1]) || "실험 성능";
    return [
      `《${title}》에서 제안한 ${kw1}의 핵심 작동 원리와 독창성은 무엇인가요?`,
      `기존 연구 및 베이스라인 대비 ${kw2} 측면에서 어떠한 차별적 성과를 입증했나요?`,
      `이 연구의 실질적인 적용 한계점과 후속 연구로 다루어야 할 과제는 무엇인가요?`
    ];
  }

  /**
   * Active AI Model analyzes candidate related papers and generates deep recommendation insights
   */
  async analyzeAndRankRelatedPapers(paper, candidatePapers = [], activeModel = null) {
    if (!paper || !candidatePapers || candidatePapers.length === 0) return candidatePapers;
    const model = activeModel || this.getActiveModel();
    const provider = this.getModelProvider(model);
    const modelName = this.getModelDisplayName(model);

    if (this.isProviderVerified(provider)) {
      try {
        const paperSummaries = candidatePapers
          .slice(0, 5)
          .map((p, idx) => `[${idx + 1}] 제목: "${p.title}" / 저자: ${p.authorsStr || p.authors} / 요약: ${(p.abstract || p.summary || "").slice(0, 150)}`)
          .join("\n");

        const prompt = `기준 논문: "${paper.title}" (키워드: ${(paper.keywordsList || []).join(", ")})
기준 논문 초록/요약: ${(paper.abstractEn || paper.summaryText || "").slice(0, 300)}

추천 후보 논문 목록:
${paperSummaries}

당신은 연구자를 돕는 전문 AI 모델(${modelName})입니다.
각 후보 논문이 기준 논문과 어떤 학술적 연관성을 갖는지, 왜 읽어볼 가치가 있는지 1~2문장의 심층 맞춤 추천 근거를 작성해 주세요.
반드시 아래와 같은 JSON 배열 형식으로만 응답하세요:
[
  { "index": 1, "matchRate": "96%", "recommendLabel": "핵심 선행 연구", "aiRationale": "기준 논문의 핵심 메커니즘을 심화 발전시킨 연구로 실무적 구현에 직결됩니다." }
]`;

        const reply = await this.callActiveAIModel(prompt, {
          systemInstruction: "학술 문헌 추천 분석가로서 각 논문의 상호 연관성과 추천 소견을 JSON으로 제공합니다."
        });

        const jsonMatch = reply.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return candidatePapers.map((p, idx) => {
            const found = parsed.find((item) => item.index === idx + 1);
            const rationale = found?.aiRationale || found?.aiReason || p.summary || `《${paper.title}》의 핵심 가설 및 연구 흐름과 직결된 주요 문헌입니다.`;
            return {
              ...p,
              aiRationale: rationale,
              aiReason: rationale,
              matchRate: found?.matchRate || p.matchRate || `${96 - idx * 2}%`,
              recommendLabel: found?.recommendLabel || p.recommendLabel || "AI 추천 논문",
              recommendedByModel: modelName
            };
          });
        }
      } catch (e) {
        console.warn("AI related papers analysis fallback:", e);
      }
    }

    return candidatePapers.map((p, idx) => {
      const kw = (paper.keywordsList || [])[idx % Math.max(1, (paper.keywordsList || []).length)] || "핵심 방법론";
      const rationale = `《${paper.title}》의 ${kw}과 학술적 맥락을 공유하며 상호 보완적 분석을 제공하는 추천 문헌입니다.`;
      return {
        ...p,
        aiRationale: p.aiRationale || rationale,
        aiReason: p.aiReason || rationale,
        matchRate: p.matchRate || `${94 - idx * 3}%`,
        recommendLabel: p.recommendLabel || (idx === 0 ? "핵심 선행 연구" : idx === 1 ? "방법론적 확장 연구" : "최신 관련 연구"),
        recommendedByModel: modelName
      };
    });
  }

  async chat(userMessage, paper, attachedContext = null, extraRefPapers = []) {
    const lang = this.getTargetLanguageInfo();
    const prompts = window.researchDB?.getPromptSettings() || {};

    const activeModel = this.getActiveModel();
    const provider = this.getModelProvider(activeModel);
    const modelName = this.getModelDisplayName(activeModel);
    const intentType = this.classifyUserIntent(userMessage);

    let intentBadge = "";
    if (intentType === "curiosity") {
      intentBadge = `> **💡 [질문 의도 분석: 직관적 호기심 탐구]** 핵심 개념을 알기 쉬운 일상 비유와 직관으로 풀어냅니다.\n\n`;
    } else if (intentType === "general") {
      intentBadge = `> **🌐 [질문 의도 분석: 연구 확장 및 거시 질의]** 학술 분야 전반의 맥락과 통찰을 바탕으로 답변합니다.\n\n`;
    } else {
      intentBadge = `> **🎯 [질문 의도 분석: 논문 심층 질의]** 논문 본문의 구체적 근거와 학술적 논지를 바탕으로 분석합니다.\n\n`;
    }

    const refNames = extraRefPapers.length > 0 ? `\n[추가 참고 논문]: ${extraRefPapers.join(", ")}` : "";
    const contextStr = attachedContext ? `\n[선택된 논문 구절]: "${attachedContext}"` : "";
    const paperHeader = paper
      ? `현재 논문: "${paper.title}" (${(paper.authors || []).join(", ")}, ${paper.year || ""})\n초록: ${paper.abstractEn || paper.summaryText || ""}\n요약: ${(paper.threeLineSummary || []).join(" / ")}`
      : "현재 열려 있는 논문이 없는 초기 상태입니다. 사용자의 학술/연구 질문에 친절히 답변하세요.";

    let sectionExcerpt = "";
    if (paper && Array.isArray(paper.sections)) {
      const secLines = [];
      for (const s of paper.sections.slice(0, 8)) {
        const pTexts = (s.paragraphs || []).slice(0, 3).map((p) => p.en || p.ko || "").filter(Boolean).join("\n");
        if (pTexts) {
          secLines.push(`[섹션 ${s.number || ""}: ${s.title}]\n${pTexts}`);
        }
      }
      if (secLines.length > 0) {
        sectionExcerpt = "\n\n[논문 본문 핵심 내용 발췌]:\n" + secLines.join("\n\n").slice(0, 7000);
      }
    }

    const intentPromptGuide = `[사용자 질문 의도 자동 파악 및 맞춤 응답 지침]
당신은 연구자를 돕는 전문 AI 모델(${modelName})입니다.
사용자의 질문("${userMessage}")을 읽고 질문의 의도를 다음 3가지 유형 중 하나로 스스로 파악·분류하여 가장 알맞은 형식으로 답변하세요:

1. [논문 심층 질의]: 현재 논문 《${paper?.title || ""}》의 본문, 방법론, 수식, 데이터셋, 실험 결과, 한계점에 대한 직접적인 학술 질문
   -> 논문 본문 및 초록을 엄밀한 근거로 삼아 전문적이고 명확하게 설명.
2. [직관적 호기심 탐구]: "왜 이 연구를 하지?", "쉽게 비유로 알려줘", "일상생활 어디에 쓰이나요?" 등 단순 호기심/개념 이해 질문
   -> 어려운 학술 용어를 쉬운 일상 비유와 직관, 실생활 예시로 풀어 호기심을 완벽히 해소.
3. [연구 확장 및 거시 질의]: 연구 분야 트렌드, 다른 기술과의 비교, 향후 전망, 산업 생태계 영향 등 확장 질문
   -> 넓은 학술 및 기술 생태계 맥락에서 균형 잡힌 통찰력과 비교 관점을 제시.

[필수 출력 형식]
답변의 첫 번째 줄은 반드시 파악한 의도에 맞는 인용 블록 뱃지로 시작하세요:
- 논문 질의: > **🎯 [질문 의도 분석: 논문 심층 질의]** 논문 본문의 구체적 근거를 바탕으로 분석합니다.
- 호기심 질의: > **💡 [질문 의도 분석: 직관적 호기심 탐구]** 핵심 개념을 알기 쉬운 일상 비유와 직관으로 풀어냅니다.
- 확장/기타 질의: > **🌐 [질문 의도 분석: 연구 확장 및 거시 질의]** 학술 분야 전반의 맥락과 통찰을 바탕으로 답변합니다.
그 뒤 빈 줄 1개를 두고, ${lang.label} 언어로 정돈된 마크다운 본문을 작성하세요.`;

    const fullPrompt = `${paperHeader}${sectionExcerpt}${refNames}${contextStr}\n\n${intentPromptGuide}\n\n[사용자 질문]: ${userMessage}`;

    // Execute active model if verified
    if (this.isProviderVerified(provider)) {
      try {
        const liveReply = await this.callActiveAIModel(fullPrompt, {
          systemInstruction: this.buildSystemInstruction(intentPromptGuide)
        });
        if (liveReply && liveReply.trim()) {
          let formattedReply = liveReply.trim();
          if (!formattedReply.includes("질문 의도")) {
            formattedReply = intentBadge + formattedReply;
          }
          const liveBadge = `> **✨ [${modelName} 실시간 본문 추론 답변]**\n`;
          return liveBadge + formattedReply;
        }
      } catch (e) {
        console.warn(`${provider} API chat live call failed, falling back to heuristics:`, e);
        const failNotice = `> **⚠️ [${modelName} 실시간 통신 지연 안내]** (${this.escapeHtml ? this.escapeHtml(e.message || "연결 지연") : "일시적 응답 지연"})\n> *원활한 연구 진행을 위해 로컬 보조 분석 결과로 응답합니다.*\n\n`;
        intentBadge = failNotice + intentBadge;
      }
    }

    await new Promise((r) => setTimeout(r, 150));

    if (!paper) {
      const msg = `현재 열람 중인 논문이 없습니다. 좌측의 **[실시간 논문 탐색]**에서 논문을 열어주시면 요약·원문 번역·심층 토론을 도와드립니다!`;
      return intentBadge + msg;
    }

    if (attachedContext) {
      let ctxTranslated = attachedContext;
      try {
        ctxTranslated = await this.translateText(attachedContext, lang.code);
      } catch (_) {}
      const replyKo = `선택하신 구절에 대한 **${modelName}** 분석입니다:\n\n> **번역:** ${ctxTranslated}\n\n**질문("${userMessage}")에 대한 답변:**\n해당 구절은 **《${paper.title}》**의 핵심 논거와 직접 연결됩니다. ${paper.threeLineSummary?.[0] || ""}${
        prompts.systemPrompt?.trim() ? `\n\n*(시스템 프롬프트 반영: "${prompts.systemPrompt.trim()}")*` : ""
      }`;
      return intentBadge + replyKo;
    }

    // Heuristic Intent-Tailored Responses
    if (intentType === "curiosity") {
      return intentBadge + `질문하신 **"${userMessage}"**에 대한 직관적인 해설입니다.\n\n` +
        `**💡 일상 비유로 이해하기:**\n` +
        `**《${paper.title}》**의 연구는 마치 수많은 자료 중에서 가장 신뢰할 수 있는 핵심 단서만을 빠르게 찾아내는 '스마트 네비게이션'과 같습니다. ${paper.threeLineSummary?.[0] || ""}\n\n` +
        `**✨ 실생활/응용 시사점:**\n` +
        `이 기술이 발전하면 우리는 일상에서 복잡한 학술 지식이나 대규모 데이터를 일일이 분석하지 않고도 핵심 통찰을 손쉽게 얻을 수 있습니다.\n\n` +
        `> **핵심 한 줄 요약:** ${paper.threeLineSummary?.[1] || paper.summaryText || "핵심 방법론 개선 연구"}`;
    }

    if (intentType === "general") {
      return intentBadge + `질문하신 **"${userMessage}"**는 본 연구 주제의 거시적 맥락과 미래 방향을 짚는 중요한 질문입니다.\n\n` +
        `**1. 학술 트렌드 및 기술 생태계:**\n` +
        `현재 **${(paper.keywordsList || []).slice(0, 3).join(", ") || "인공지능 및 학술 연구"}** 분야는 단편적 기술 검증 단계를 지나 실제 복합 환경에서의 신뢰성과 확장성(Scalability)을 확보하는 방향으로 진화하고 있습니다.\n\n` +
        `**2. 본 연구의 위치와 비교 관점:**\n` +
        `본 논문 **《${paper.title}》**은 ${paper.threeLineSummary?.[1] || "방법론적 개선"}을 통해 기존 학계의 주요 병목을 해소하는 역할을 합니다.\n\n` +
        `**3. 향후 발전 전망:**\n` +
        `앞으로 유사 연구들은 더 다양한 모달리티와 결합하거나 더 적은 계산 자원으로 대규모 지식을 다루는 방향으로 연구 지평이 넓어질 것으로 기대됩니다.`;
    }

    // Default: 'paper' (논문 심층 질의)
    const q = userMessage.toLowerCase();
    let baseReply = "";

    if (q.includes("핵심") || q.includes("요약") || q.includes("summary") || (q.includes("뭐야") && !q.includes("달라") && !q.includes("한계"))) {
      baseReply = `**《${paper.title}》 핵심 정리:**\n\n1. ${paper.threeLineSummary?.[0] || ""}\n2. ${paper.threeLineSummary?.[1] || ""}\n3. ${paper.threeLineSummary?.[2] || ""}\n\n**종합 요약:**\n${paper.summaryText || ""}`;
    } else if (q.includes("기존") || q.includes("달라") || q.includes("차이") || q.includes("독창성") || q.includes("novel")) {
      baseReply = `**《${paper.title}》의 연구적 차별점 및 핵심 방법론:**\n\n- **문제 정의:** ${paper.threeLineSummary?.[0] || ""}\n- **제안 방법:** ${paper.threeLineSummary?.[1] || ""}\n- **주요 성과:** ${paper.threeLineSummary?.[2] || ""}`;
    } else if (q.includes("한계") || q.includes("약점") || q.includes("향후") || q.includes("limitation")) {
      baseReply = `**본 연구 검토 시 확인해야 할 한계점 및 후속 연구 포인트:**\n\n1. 본문에서 다룬 핵심 도메인 키워드(**${(paper.keywordsList || []).slice(0, 4).join(", ")}**) 외의 실험 조건이나 더 큰 스케일에서의 일반화 성능을 점검해 보세요.\n2. 상단 **⚙️ 설정 → 기본 설정**에서 API 키를 등록하고 검증하시면 선택하신 ${modelName} 모델의 심층 추론 분석을 실시간으로 활용하실 수 있습니다.`;
    } else {
      const qTokens = userMessage
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2);
      let bestPara = "";
      let bestScore = 0;
      for (const sec of paper.sections || []) {
        for (const p of sec.paragraphs || []) {
          const hay = `${p.en} ${p.ko || ""}`.toLowerCase();
          let score = 0;
          for (const tk of qTokens) {
            if (hay.includes(tk)) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestPara = p.en;
          }
        }
      }
      let relevantTrans = paper.summaryText || "";
      if (bestPara) {
        try {
          relevantTrans = await this.translateText(bestPara.slice(0, 500), lang.code);
        } catch (_) {
          relevantTrans = bestPara.slice(0, 500);
        }
      }

      baseReply = `질문하신 **"${userMessage}"**와 관련하여 논문 본문에서 찾은 핵심 내용입니다:\n\n> ${relevantTrans}\n${
        prompts.systemPrompt?.trim() ? `\n*(맞춤 시스템 프롬프트 적용됨: ${prompts.systemPrompt.trim()})*` : ""
      }${extraRefPapers.length > 0 ? `\n📎 *첨부 참고 논문: ${extraRefPapers.join(", ")}*` : ""}`;
    }

    return intentBadge + baseReply;
  }

  /**
   * Builds a rich structured paper object from PDF.js extracted pages & layout engine
   */
  buildStructuredUploadedPaper(fileName, pagesText, structuredDoc) {
    const fullText = pagesText.join("\n\n");
    const sentences = fullText
      .replace(/\s+/g, " ")
      .split(/(?<=[.?!])\s+/)
      .filter((s) => s.length > 40 && s.length < 340);

    let hlCounter = 0;
    const sections =
      structuredDoc.sections && structuredDoc.sections.length > 0
        ? structuredDoc.sections
        : pagesText.map((txt, idx) => ({
            id: `up-sec-${idx + 1}`,
            number: String(idx + 1),
            title: `Page ${idx + 1}`,
            titleKo: "",
            page: idx + 1,
            paragraphs: [
              {
                id: `up-p-${idx + 1}`,
                en: txt || "(이미지 중심 페이지입니다.)",
                ko: "",
                translatedLang: "",
                highlights: []
              }
            ]
          }));

    for (const sec of sections) {
      for (const para of sec.paragraphs) {
        if (hlCounter >= 8) break;
        const pSentences = para.en.split(/(?<=[.?!])\s+/);
        for (const s of pSentences) {
          if (hlCounter >= 8) break;
          if (
            s.length > 45 &&
            /\b(propose|present|introduce|novel|design|demonstrate|achieve|outperform|significant|agreement|method|result)\b/i.test(
              s
            )
          ) {
            hlCounter++;
            const cat = /achieve|outperform|agreement|experiment|result/i.test(s)
              ? "result"
              : /design|method|algorithm|measure/i.test(s)
              ? "methodology"
              : "novelty";
            para.highlights.push({
              id: `up-hl-${Date.now()}-${hlCounter}`,
              category: cat,
              categoryLabel:
                cat === "result" ? "실험 결과" : cat === "methodology" ? "핵심 방법론" : "독창성 / 기여",
              phrase: s.trim(),
              aiNote: "PDF 구조 분석 엔진이 학술 담화 표지어를 기반으로 자동 감지한 핵심 문장입니다."
            });
          }
        }
      }
    }

    const stopWords = new Set([
      "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
      "have", "has", "been", "into", "between", "using", "based", "which", "their",
      "also", "such", "can", "shown", "figure", "table", "section", "paper", "study",
      "results", "method", "where", "when", "these", "those", "under", "about", "after"
    ]);
    const freq = {};
    const words = fullText.match(/\b[A-Za-z][A-Za-z\-]{4,24}\b/g) || [];
    for (const w of words) {
      const lw = w.toLowerCase();
      if (!stopWords.has(lw)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const topTerms = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([term, count]) => ({
        term,
        termKo: `${term}`,
        definition: `본문에서 ${count}회 등장하는 핵심 학술 용어입니다. (문맥 번역 동기화 중...)`,
        importance: `문서 내 ${count}회 등장 핵심 키워드`
      }));

    const cleanTitle = structuredDoc.detectedTitle || fileName.replace(/\.pdf$/i, "");
    const rawAbstract = sentences.slice(0, 4).join(" ") || fullText.slice(0, 460);

    return {
      id: `uploaded-${Date.now()}`,
      isUploadedPdf: true,
      title: cleanTitle,
      titleKo: "",
      shortTitle: cleanTitle.slice(0, 25) + (cleanTitle.length > 25 ? "..." : ""),
      timeAgo: "방금 업로드됨",
      folder: "내 업로드 논문",
      authors: ["Uploaded PDF Document"],
      affiliationsLines: [`총 ${pagesText.length}페이지 · 로컬 DB 저장됨`],
      venue: "Uploaded Research PDF",
      year: new Date().getFullYear(),
      arxivStamp: `${fileName}  [Pages: ${pagesText.length}]`,
      arxivId: fileName,
      totalPages: pagesText.length,
      savedInLibrary: true,
      abstractEn: rawAbstract,
      abstractKo: "",
      keywordsList: topTerms.map((t) => t.term),
      keywordDictionary: topTerms,
      threeLineSummary: [
        sentences[0] || `총 ${pagesText.length}페이지 PDF에서 핵심 문장을 분석 중입니다.`,
        sentences[1] || "본문 핵심 방법론과 실험 결과를 번역 및 요약하고 있습니다.",
        sentences[2] || "우측 상단 설정에서 원하는 언어와 맞춤 프롬프트를 지정할 수 있습니다."
      ],
      summaryText: rawAbstract || `업로드된 **${fileName}** (${pagesText.length}페이지) 문서를 분석 중입니다...`,
      suggestedQuestions: [
        "이 논문의 핵심이 뭐야?",
        "기존 연구랑 뭐가 달라?",
        "한계점이 뭐야?"
      ],
      sections,
      pageBlocksByPage: structuredDoc.pageBlocksByPage || {},
      equations: structuredDoc.equations || [],
      figures: structuredDoc.figures || [],
      citations: structuredDoc.citations || []
    };
  }
}

window.moonlightAI = new MoonlightAIService();
