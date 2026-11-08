# Moonlight AI Research Studio (AI 논문 리더기 및 연구 플랫폼)

> **누구나 어디서든 바로 접속하여 사용할 수 있는 브라우저 기반 AI 학술 논문 뷰어 및 연구 독해 보조 플랫폼**

---

## 🌟 주요 기능 (Key Features)

1. **초고해상도 PDF 렌더링 & 텍스트 레이어 (Mozilla PDF.js)**
   - 캔버스 기반 선명한 렌더링 및 줌 인/아웃(30%~300%) 지원.
   - 드래그 시 줄바꿈/여백 왜곡 없는 부드러운 텍스트 하이라이트.
   - arXiv 워터마크 선택 제외 알고리즘으로 여백 텍스트 간섭 차단.

2. **다단 레이아웃 보존 1:1 번역 (Layout-Preserving Translation)**
   - 원본 PDF의 논문 구조(단락, 제목, 그림 위치)를 그대로 유지한 채 원문 위에 1:1 오버레이 번역 또는 원문-번역 병렬 대조 뷰 제공.

3. **풍부한 멀티 AI 모델 연동 (Google · OpenAI · Anthropic)**
   - 사용자가 직접 API 키를 등록하여 주(기본) AI 모델을 자유롭게 선택 및 전환:
     - **Google Gemini**: Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, 1.5 Pro, 1.5 Flash, 3.1 Flash Lite, 3 Flash, 3.8 Flash, 3.1 Pro
     - **OpenAI**: GPT-4o, GPT-4o mini, o1, o1-mini, o3-mini, GPT-4 Turbo, GPT-5 nano, GPT-6 Luna, GPT-6.1 Sol
     - **Anthropic Claude**: Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus, Claude Sonnet 5, Claude Opus 5.5

4. **문맥 기반 AI 플로팅 팔레트 (드래그 액션)**
   - 텍스트 선택 시 즉각 호출: 설명(E), 인포그래픽(I), 5색 하이라이트(H), 번역(T), 주석(C), AI에게 질문(Enter).

5. **인포그래픽 다이어그램 & 비전 이미지 설명**
   - 논문 전체 또는 선택한 단락의 핵심 로직을 시각 다이어그램으로 생성.
   - 마우스 드래그 바운딩 박스를 통한 그림/표/수식 캡처 및 LaTeX 수식 추출.

6. **브랜드 커스텀 & 프롬프트 개인화**
   - 서비스 이름, 서브 타이틀, 닉네임, 4색 테마(인디고, 에메랄드, 스카이, 로즈) 지원.
   - 100% 브라우저 로컬 스토리지(IndexedDB) 보관으로 개인정보 및 논문 데이터 보호.

---

## 🚀 누구나 접속 가능한 웹사이트로 배포하는 방법 (Deployment Guide)

본 프로젝트는 순수 프런트엔드 정적 웹 애플리케이션 및 Vercel 서버리스 API(`api/`)로 구성되어 있어, **별도의 복잡한 백엔드 설정 없이 누구나 무료로 웹 사이트에 배포**할 수 있습니다.

### 방법 1. Vercel 배포 (가장 추천 - 1분 완료)
1. [Vercel](https://vercel.com/)에 가입하거나 로그인합니다.
2. 프로젝트 폴더를 GitHub 저장소에 Push한 뒤, Vercel 대시보드에서 **`Add New...` → `Project`**를 클릭하고 해당 저장소를 선택합니다.
3. 별도의 빌드 명령 없이 **`Deploy`** 버튼을 누르면 즉시 고유한 공개 URL(`https://your-project.vercel.app`)이 생성됩니다.
4. **Vercel CLI**를 사용하실 경우:
   ```bash
   npm install -g vercel
   vercel
   ```
   (프로젝트 루트에 이미 `vercel.json`과 `api/` 서버리스 함수가 준비되어 있어 자동 배포됩니다.)

---

### 방법 2. Netlify 드래그 앤 드롭 배포 (30초 완료)
1. [Netlify Drop](https://app.netlify.com/drop) 페이지로 이동합니다.
2. 이 프로젝트 폴더(`c:\Users\e05ch\OneDrive\Desktop\안티그래비티`) 전체를 브라우저 창에 그대로 끌어다 놓습니다(Drag & Drop).
3. 즉시 무료 공개 URL(`https://random-name.netlify.app`)이 발급되며 전 세계 누구나 접속할 수 있습니다.

---

### 방법 3. GitHub Pages 배포
1. GitHub에서 새 Repository(Public)를 생성하고 본 폴더의 파일들을 커밋 & 푸시합니다.
2. Repository의 **Settings → Pages** 탭으로 이동합니다.
3. **Branch**를 `main` (또는 `master`)의 `/(root)`로 지정하고 **Save**를 누릅니다.
4. 잠시 후 `https://<github-username>.github.io/<repo-name>/` 주소로 공개 웹사이트가 오픈됩니다.

---

## 💻 로컬(내 컴퓨터)에서 테스트 실행하기

1. **배치 파일 실행**:
   - `start_server.bat` 더블 클릭
2. **또는 파이썬 직접 실행**:
   ```bash
   py server.py
   ```
3. 브라우저에서 `http://localhost:8080` 접속.

---

## 📁 프로젝트 파일 구성

```text
├── index.html              # 메인 애플리케이션 진입점 (SPA UI)
├── library.html            # 전체화면 독립 라이브러리 뷰
├── styles.css              # 커스텀 테마, 인포그래픽, 텍스트 레이어 스타일
├── app.js                  # 전역 컨트롤러 및 이벤트/인터랙션 핸들러
├── ai-service.js           # Gemini / OpenAI / Claude API 통신 및 번역 서비스
├── pdf-engine.js           # PDF.js 캔버스 렌더링 및 다단 텍스트 레이아웃 분석
├── academic-api.js         # OpenAlex 학술 논문 검색 및 메타데이터 API
├── infographic-engine.js   # 학술 인포그래픽 SVG 다이어그램 생성기
├── storage-db.js           # IndexedDB 기반 클라이언트 로컬 저장소
├── papers-data.js          # 초기 논문 데이터셋 (Clean 상태)
├── vercel.json             # Vercel 클라우드 배포 설정
├── package.json            # 배포 플랫폼 메타데이터
├── api/                    # 클라우드 서버리스 API 함수
│   ├── proxy-pdf.js        # 원격 PDF 다운로드 및 CORS 우회 프록시
│   ├── translate.js        # 번역 프록시 엔드포인트
│   └── health.js           # 헬스 체크 엔드포인트
├── server.py               # 로컬 테스트용 파이썬 서버
└── start_server.bat        # 원클릭 로컬 서버 실행 스크립트
```
