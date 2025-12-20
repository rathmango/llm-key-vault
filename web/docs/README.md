# Web Docs (Source of Truth)

이 폴더는 **외부 API/모델 문서를 “고정(pin)”** 해두는 곳입니다.  
앞으로 기능을 추가하거나 수정할 때는, **반드시 여기 문서를 먼저 읽고** 그 내용을 기준으로 구현합니다.

## 규칙

- **모델/엔드포인트/스트리밍/툴 스키마를 임의로 추측하지 않는다.**
- **모델명을 바꾸거나(예: GPT‑5.2 → 다른 모델), API 스펙을 변경하면**
  - 먼저 이 문서를 업데이트하고,
  - 코드 변경은 그 다음에 진행한다.
- 본 프로젝트의 OpenAI 연동은 코드에서 이미 **Responses API + streaming**을 사용 중이며, 문서는 그 구현과 공식 API 문서를 함께 기준으로 삼는다.

## 문서 목록

- **OpenAI (GPT‑5.2 / Responses API / Streaming / Tools / Web Search)**: `openai-gpt-5.2.md`
- **OpenAI (GPT‑5.2 canonical, user‑provided)**: `openai-gpt-5.2-canonical.md`
- **Gemini API (모델명, URL Context, Video Understanding)**: `gemini.md`
- **YouTube Data API v3 (videos.list/search.list, quota, captions 제약)**: `youtube-data-api.md`
- **YouTube Data API v3 설정(프로젝트용, API Key 발급/제한/환경변수)**: `youtube-data-api-setup.md`
- **UX/UI 상세 설계 (추천 영상 → 클릭 → 대화)**: `ux-content-to-conversation.md`


