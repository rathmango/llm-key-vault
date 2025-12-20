# Gemini API — 모델/URL Context/Video Understanding 고정 문서

> 목적: 2025년 12월 기준 Gemini API가 매우 빠르게 업데이트되므로, **모델명/기능/입력 방법**을 문서로 고정해두고 “옛날 모델명/옛날 SDK”로 개발하는 사고를 방지한다.

## 0) 공식 문서 링크(참조)

- **Gemini 모델 목록(업데이트 포함)**: `https://ai.google.dev/gemini-api/docs/models?hl=ko`
- **URL Context(도구)**: `https://ai.google.dev/gemini-api/docs/url-context?hl=ko`
- **Video Understanding(동영상 이해)**: `https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko`

## 1) 모델 라인업(2025‑12‑18 기준 페이지에 명시)

문서에는 다음 계열이 소개된다:

- **Gemini 3 Pro**
- **Gemini 3 Flash**
- **Gemini 2.5 Flash**
- **Gemini 2.5 Flash‑Lite**
- **Gemini 2.5 Pro**
- (이전 모델) **Gemini 2.0 Flash**, **Gemini 2.0 Flash‑Lite**

출처: `https://ai.google.dev/gemini-api/docs/models?hl=ko`

## 2) “모델 문자열” 이름 패턴(중요)

문서는 Gemini 모델이 다음 버전 채널로 제공된다고 설명한다:

- **정식(안정화)**: 예 `gemini-2.5-flash`
- **미리보기**: 예 `gemini-2.5-flash-preview-09-2025`
- **최신(alias)**: 예 `gemini-flash-latest` (릴리스 때마다 핫스왑, 사전 통지)
- **실험용**

출처: `https://ai.google.dev/gemini-api/docs/models?hl=ko`

> 구현 팁: 프로덕션은 가급적 “정식(안정화)” 모델을 고정하고, 실험/프리뷰는 별도 플래그로 분리하는 게 안전하다.

## 3) URL Context 도구(YouTube/웹 페이지 컨텍스트에 유리)

URL Context 도구를 켜면, 프롬프트에 포함된 URL의 콘텐츠를 모델이 참고할 수 있다.

문서 핵심:

- URL Context는 **2단계 검색 프로세스**를 사용:
  - 먼저 **내부 색인 캐시**에서 가져오기 시도(속도/비용 최적화)
  - 색인에 없으면 **실제 가져오기**로 자동 대체(실시간 fetch)
- 응답에는 `url_context_metadata`가 포함되어, 어떤 URL을 가져왔고 상태가 어땠는지 확인 가능

출처: `https://ai.google.dev/gemini-api/docs/url-context?hl=ko`

### 3.1 문서 예시(Python) — url_context 활성화

문서 예시에서 핵심은 `tools = [{"url_context": {}}]` 를 켜고, 프롬프트에 URL을 포함하는 것이다.

```python
from google import genai
from google.genai.types import GenerateContentConfig

client = genai.Client()
model_id = "gemini-2.5-flash"
tools = [{"url_context": {}}]

url1 = "https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592"
url2 = "https://www.allrecipes.com/recipe/21151/simple-whole-roast-chicken/"

response = client.models.generate_content(
  model=model_id,
  contents=f"Compare the ingredients and cooking times from the recipes at {url1} and {url2}",
  config=GenerateContentConfig(tools=tools),
)

print(response.candidates[0].url_context_metadata)
```

출처: `https://ai.google.dev/gemini-api/docs/url-context?hl=ko`

## 4) Video Understanding(동영상 이해): “완벽한 컨텍스트”에 가장 근접한 경로

YouTube 링크로 “정확한 타임스탬프 + 전문(전사) + 요약”을 얻고 싶을 때,
YouTube Data API의 captions는 권한 제약이 크므로(임의 영상에 적용 어려움),
Gemini의 Video Understanding은 강력한 대안이 된다.

문서가 제시하는 동영상 입력 방식 3가지:

- **Files API로 업로드 후 `generateContent`**  
  - 20MB보다 크거나, 1분보다 길거나, 재사용할 파일이면 권장
- **짧은 동영상은 인라인 데이터로 `generateContent`**
- **YouTube URL을 `generateContent` 요청에 포함**

또한 문서는 “동영상 내 특정 타임스탬프 참조”를 지원한다고 명시한다.

출처: `https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko`

### 4.1 문서 예시(Python) — YouTube URL을 직접 전달

문서에는 “YouTube URL 기능은 미리보기(preview)로 제공”되며, `generate_content` 입력의 `file_uri`에 YouTube URL을 넣는 예시가 있다.

```python
from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
  model="models/gemini-2.5-flash",
  contents=types.Content(
    parts=[
      types.Part(file_data=types.FileData(file_uri="https://www.youtube.com/watch?v=9hE5-98ZeCg")),
      types.Part(text="Please summarize the video in 3 sentences."),
    ]
  )
)
```

출처: `https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko`

### 4.2 타임스탬프/구간 클리핑(대화 UX에 매우 중요)

문서에는:

- `MM:SS` 타임스탬프를 사용해 특정 시점 질문 가능
- `VideoMetadata(start_offset, end_offset)`로 **구간 클리핑** 가능
- 기본 샘플링은 **1 FPS**이며, 필요하면 FPS를 조절할 수 있음

또한 YouTube URL 기능 제한사항으로:

- 무료 등급: 하루 8시간 이상 YouTube 동영상 업로드 불가
- 전체 공개 영상만 가능(비공개/일부 공개 불가)
- Gemini 2.5 이상 모델은 요청당 최대 10개 영상까지

출처: `https://ai.google.dev/gemini-api/docs/video-understanding?hl=ko`

## 5) 이 프로젝트에서 Gemini를 쓰게 된다면(권장 역할 분담)

> 현재 프로젝트는 OpenAI GPT‑5.2 + Web Search가 이미 붙어 있음.

“추천 영상 → 클릭 → 대화”에서 **완벽한 컨텍스트**를 얻는 전략은 보통 2가지다:

- **A안(단일 LLM): GPT‑5.2로만 처리**
  - 장점: 단일 공급자, 단일 프롬프트/정책
  - 단점: YouTube 전문/타임스탬프 확보가 YouTube 측 권한/전사 파이프라인에 좌우됨

- **B안(하이브리드): Gemini로 ‘전사/타임스탬프/전문’을 생성 → GPT‑5.2로 대화**
  - 장점: Lilys.ai 같은 “빠르고 정확한 전문+타임스탬프” 경험에 가장 근접
  - 단점: 공급자 2개(비용/키 관리/프라이버시 고지 필요)

현재 사용자 요구(“몇 초에 무슨 말까지 정확”)를 고려하면, **B안**이 UX/정확도 관점에서 가장 유력하다.


