# OpenAI (GPT‑5.2) — API/모델/Streaming/Tools 고정 문서

> 목적: 2025년 12월 기준, 이 프로젝트에서 **OpenAI API를 “어떻게” 쓰는지**를 문서로 고정해두고, 개발 중 “모델명이 없다/바꿔야 한다” 같은 혼선을 방지한다.

## 0) 이 프로젝트에서의 “사실(SSoT)”

- **기본 모델(클라이언트/서버 기본값)**: `gpt-5.2-2025-12-11`
  - 클라이언트: `web/src/app/page.tsx`
  - 서버: `web/src/app/api/chat/route.ts`
  - 컨텍스트 한도 추정: `web/src/lib/context.ts`
- **주 API 엔드포인트**: `POST https://api.openai.com/v1/responses`
  - 구현: `web/src/lib/llm.ts`, `web/src/app/api/chat/route.ts`
- **Streaming 방식**: Server‑Sent Events(SSE)
  - 서버가 OpenAI SSE를 받아 **앱 내부 SSE 포맷**으로 변환해 프론트로 전달
  - 구현: `web/src/lib/llm.ts` + `web/src/app/api/chat/route.ts`

## 1) 공식 문서 링크(참조)

- **Responses API Reference**: `https://platform.openai.com/docs/api-reference/responses`
- **Web search tool guide**: `https://platform.openai.com/docs/guides/tools-web-search`
- (참조) **Responses streaming events**: `https://platform.openai.com/docs/api-reference/responses-streaming`  
  - 본 프로젝트는 이 페이지의 이벤트 스키마를 전제로 SSE를 파싱합니다. (접근이 막히면 아래 “3) 프로젝트 구현 기준 이벤트”를 SSoT로 사용)
- **(Pinned) GPT‑5.2 Canonical Docs (user‑provided)**: `web/docs/openai-gpt-5.2-canonical.md`

## 2) Responses API — 요청 바디에서 우리가 쓰는 필드(핵심만)

> 아래 필드 정의/설명은 Responses API reference를 기준으로 한다.  
> 특히 `max_output_tokens`, `tools`, `tool_choice`, `include`, `stream` 정의는 API 레퍼런스에 명시됨.  
> (`https://platform.openai.com/docs/api-reference/responses`)

### 2.1 최소 요청 구조(개념)

- **`model`**: 모델 ID 문자열
- **`input`**: 메시지 입력(텍스트/이미지 등)
- **`stream: true`**: SSE 스트리밍 활성화
- **`max_output_tokens`**: 출력 토큰 상한 (가시 토큰 + reasoning 토큰 포함)
- **`reasoning`**: reasoning 모델에서 `effort`, `summary` 등을 설정 가능
- **`text`**: 출력 텍스트 옵션(예: `verbosity`)

### 2.2 Web Search(tool) 사용 시 추가

OpenAI 내장 웹검색은 Responses API의 **built‑in tool**로 사용한다.

- **`tools: [{ type: "web_search", ... }]`**
- **`tool_choice`**: `"auto" | "required" | "none"` (프로젝트는 기본적으로 required로 사용)
- **`include: ["web_search_call.action.sources"]`**: 출처(source) 메타데이터를 응답에 포함

공식 가이드 예시(curl)에서는 다음 형태를 보여준다:

- `tools: [ { "type": "web_search", "external_web_access": false } ]`
- `tool_choice: "auto"`
- `include: ["web_search_call.action.sources"]`

출처: `https://platform.openai.com/docs/guides/tools-web-search`

또한 도메인 allow‑list 필터링은 `filters.allowed_domains`를 사용한다(최대 100개, URL은 `https://` 없이 도메인만).

출처: `https://platform.openai.com/docs/guides/tools-web-search`

#### 2.2.1 문서 예시(curl) 원형(참고)

> 아래는 OpenAI 문서에 실린 형태를 **그대로** 요약해 적어둔 것.  
> 실제 사용 시 `model` 값은 프로젝트 기본 모델(예: `gpt-5.2-2025-12-11`)로 바꿔 사용하면 된다.

```bash
curl "https://api.openai.com/v1/responses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5",
    "tools": [
      { "type": "web_search", "external_web_access": false }
    ],
    "tool_choice": "auto",
    "input": "Find the sunrise time in Paris today and cite the source."
  }'
```

출처: `https://platform.openai.com/docs/guides/tools-web-search`

## 3) Streaming(SSE) — 이 프로젝트가 “실제로” 처리하는 이벤트 타입

> OpenAI SSE 이벤트는 공식 레퍼런스(Streaming events)에 정의되어 있으며,  
> **본 프로젝트는 아래 타입을 처리하도록 구현되어 있다.**

### 3.1 OpenAI → 서버 변환(요약)

서버(`web/src/lib/llm.ts`)는 OpenAI SSE를 읽어 다음을 수행한다:

- `response.output_text.delta` → `{ type: "text", delta }` 이벤트로 프론트에 전달
- `response.reasoning_summary_text.delta` → `{ type: "thinking", delta }`
- `web_search_call` 결과에서 sources를 뽑아 `{ type: "sources", sources: [{title,url}...] }`
- `response.completed`에서 usage를 뽑아 `{ type: "usage", usage: { inputTokens, outputTokens, reasoningTokens } }`
- 마지막에 `data: [DONE]` 전송

프론트(`web/src/app/page.tsx`)는 서버 SSE를 읽어:

- `type === "text" | "thinking" | "sources" | "usage"`를 누적/렌더링

### 3.2 왜 이 구조가 중요한가?

- **UX 측면**: 스트리밍 텍스트/추론 요약/출처를 분리해서, 모바일에서도 “빠르게 뭔가가 보이는” 체감 속도를 만든다.
- **안정성 측면**: 중간 JSON 파싱 실패, 연결 끊김 등을 서버에서 완충한다.

## 4) 이미지 입력(현재 구현 방식)

현재 UI는 이미지를 **클라이언트에서 압축 → Base64(data URL)** 로 만들고,
메시지 content를 `[{ type:"text" }, { type:"image_url" }]` 형태로 보낸다.

서버는 이를 Responses 포맷으로 변환하면서:

- `text` → `{ type: "input_text", text }`
- `image_url` → `{ type: "input_image", image_url: "<data-url>" }`

관련: Responses API는 텍스트/이미지 입력을 지원하고, `include`에서 `message.input_image.image_url`을 지원 항목으로 명시한다.
출처: `https://platform.openai.com/docs/api-reference/responses`

## 5) Web Search: 이 프로젝트의 현재 동작(중요)

- UI에는 “웹검색” 토글이 있고, on이면 서버 요청 바디에 `webSearch.enabled=true`를 보낸다.
- 서버는 **OpenAI built‑in `web_search` tool**을 사용한다. (Tavily 사용 아님)
- 현재 `maxResults`(UI에서 5/10/15/20)는 서버에서 OpenAI tool 파라미터로 전달되지 않는다(무시됨).

> 참고: `web/README.md`에는 Tavily 기반이라고 적혀 있으나, 현재 코드와 불일치(문서 업데이트 필요).

## 6) 개발 체크리스트(이 문서를 보고 구현할 때)

- **모델명**: 우선 `gpt-5.2-2025-12-11`을 그대로 사용(바꾸면 문서부터 수정)
- **엔드포인트**: reasoning/web search 케이스는 `POST /v1/responses`
- **Streaming**: 서버에서 OpenAI SSE → 앱 SSE로 변환한다는 가정 유지
- **출처 표시**: `include: ["web_search_call.action.sources"]` 유지 + 프론트에서 Sources 렌더링


