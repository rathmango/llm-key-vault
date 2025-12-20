# YouTube Data API v3 — 추천/검색/쿼터/자막(제약) 고정 문서

> 목적: “한국 경제 인기 영상 추천 → 클릭 → 컨텍스트 생성”을 위해 YouTube Data API v3를 어떤 방식으로 사용할지 고정하고,
> quota/자막 권한 제약 때문에 구현이 흔들리지 않게 한다.

## 0) 공식 문서 링크(참조)

- **videos.list**: `https://developers.google.com/youtube/v3/docs/videos/list?hl=ko`
- **search.list**: `https://developers.google.com/youtube/v3/docs/search/list?hl=ko`
- **Getting started / quota 설명**: `https://developers.google.com/youtube/v3/getting-started?hl=ko`
- **captions.list(권한 필요)**: `https://developers.google.com/youtube/v3/docs/captions/list`
- **captions.download(권한 필요)**: `https://developers.google.com/youtube/v3/docs/captions/download?hl=en`

## 1) 추천(인기 영상) — `videos.list` (mostPopular)

문서에 따르면 `videos.list`는 `chart`를 통해 인기 차트를 조회할 수 있고,
`mostPopular`은 “지정된 콘텐츠 지역 및 동영상 카테고리의 인기 동영상”을 반환한다.

핵심 파라미터:

- `chart=mostPopular`
- `regionCode`: 조회할 국가(ISO 3166‑1 alpha‑2)
- `videoCategoryId`: 특정 카테고리의 인기 영상(기본값 0 = 카테고리 제한 없음)

출처: `https://developers.google.com/youtube/v3/docs/videos/list?hl=ko`

### 1.1 예시 요청(REST)

```text
GET https://www.googleapis.com/youtube/v3/videos
  ?part=snippet,statistics,contentDetails
  &chart=mostPopular
  &regionCode=KR
  &maxResults=5
  &key=YOUR_API_KEY
```

> `maxResults`는 1~50 (기본 5)이며, `id`와는 같이 못 쓰는 등 제약이 있다.
출처: `https://developers.google.com/youtube/v3/docs/videos/list?hl=ko`

## 2) 검색 기반 큐레이션 — `search.list`

문서에 따르면 `search.list`는:

- `part`는 `snippet`으로 설정
- 기본적으로 `type`을 지정하지 않으면 video/playlist/channel이 섞일 수 있음  
  (경제 추천 UX에서는 보통 `type=video`로 제한하는 것이 안전)

출처: `https://developers.google.com/youtube/v3/docs/search/list?hl=ko`

### 2.1 예시 요청(REST)

```text
GET https://www.googleapis.com/youtube/v3/search
  ?part=snippet
  &type=video
  &q=금리
  &regionCode=KR
  &maxResults=5
  &key=YOUR_API_KEY
```

실무 팁(한국 경제 추천):

- `regionCode=KR`, `relevanceLanguage=ko`(지원 시), `q=경제 OR 금리 OR 부동산 ...`
- 또는 “채널 기반”으로 `channelId`를 고정하고 최신/인기 동영상을 가져오는 방식(스팸/낚시 제목 완화)

## 3) 할당량(Quota) — 기본 10,000 units/day

Getting started 문서에 따르면:

- YouTube Data API는 할당량을 사용하며 **모든 API 요청은 최소 1포인트 비용**이 든다.
- API 사용 설정된 프로젝트에는 **일일 10,000 단위 기본 할당량**이 부여된다(변경될 수 있음).
- 사용량/한도는 API 콘솔에서 확인한다.

출처: `https://developers.google.com/youtube/v3/getting-started?hl=ko`

## 4) “자막/전문”을 YouTube API로 가져오는 것의 한계(중요)

`captions.list` / `captions.download` 문서는 모두:

- “This request requires authorization …” (OAuth scope 기반 인증 필요)

즉, **임의의(다른 사람이 올린) YouTube 영상**에 대해 “전문/타임스탬프 자막”을 API로 마음대로 가져오는 구조가 아니다.

출처:

- `https://developers.google.com/youtube/v3/docs/captions/list`
- `https://developers.google.com/youtube/v3/docs/captions/download?hl=en`

## 5) 그래서 ‘완벽한 컨텍스트’는 어떻게 얻나?

이 프로젝트 요구(“전문 + 타임스탬프 + 정확한 요약 + 대화”)를 만족하려면:

- **YouTube Data API v3는 ‘추천/메타데이터(제목/썸네일/채널/조회수)’용**
- **전문/타임스탬프/실제 내용 이해는 다른 경로가 필요**
  - Gemini Video Understanding(YouTube URL 입력) 또는
  - 자체 전사 파이프라인(오디오 추출 + ASR) 등

Gemini 쪽은 `web/docs/gemini.md` 참고.

## 6) 이 프로젝트에서의 설정 방법

- API Key 발급/제한/환경변수 설정은 `web/docs/youtube-data-api-setup.md` 참고.


