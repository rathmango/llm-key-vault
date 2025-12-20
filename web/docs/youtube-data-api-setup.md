# YouTube Data API v3 설정 가이드 (이 프로젝트용)

> 목적: Home 탭의 **“YouTube 추천 영상 카드(썸네일/제목)”** 기능을 사용하기 위해,
> Google Cloud Console에서 **YouTube Data API v3**를 활성화하고 **API Key**를 발급/설정한다.

## 1) Google Cloud 프로젝트 준비

- Google Cloud Console에서 **프로젝트를 선택**하거나 **새 프로젝트를 생성**한다.

## 2) YouTube Data API v3 활성화

- **APIs & Services → Library**
- **YouTube Data API v3** 검색 → **Enable(사용)** 클릭

## 3) API Key 생성

- **APIs & Services → Credentials**
- **Create credentials → API key**
- 생성된 키를 복사한다.

## 4) 키 제한(권장)

서버에서 호출하는 키이므로(브라우저에 노출 X), 다음 제한을 권장한다:

- **API restrictions**: “Restrict key” 선택 → **YouTube Data API v3**만 허용
- **Application restrictions**:
  - 로컬 개발/서버리스 환경(예: Vercel)에서는 IP가 고정되지 않는 경우가 많아, 무리한 IP 제한은 오히려 장애를 만든다.
  - 우선은 **None(제한 없음)** 으로 두고, 운영 환경에서 고정 egress IP를 쓸 수 있을 때만 IP 제한을 고려한다.

## 5) 이 프로젝트에 환경변수로 넣기

이 프로젝트는 서버에서 아래 환경변수를 읽는다:

- **`YOUTUBE_DATA_API_KEY` (권장)**  
  (호환용으로 `YOUTUBE_API_KEY`도 지원하지만, 하나만 쓰는 걸 권장)

### 로컬 개발

- `web/.env.local` (gitignore) 파일에 추가:

```bash
YOUTUBE_DATA_API_KEY=여기에_발급받은_API_KEY
```

- 개발 서버를 재시작한다.

### 배포 환경(예: Vercel)

- 프로젝트의 Environment Variables에 `YOUTUBE_DATA_API_KEY`를 추가하고 재배포한다.

## 6) 코드에서 어디에 쓰나?

- 추천 API 라우트: `web/src/app/api/youtube/recommendations/route.ts`
- Home 화면 호출: `web/src/app/page.tsx` (`HomeView`가 `/api/youtube/recommendations` 호출)

## 7) 자주 나오는 에러/해결

- **에러: “Missing YouTube API key …”**
  - 서버 env var `YOUTUBE_DATA_API_KEY`가 설정되지 않음
- **403 / quota 관련**
  - Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas에서 사용량/제한 확인
- **주의: 자막(captions) 전문은 이 키만으로 못 가져온다**
  - `captions.list` / `captions.download`는 OAuth 인증이 필요 (자세한 제약은 `youtube-data-api.md` 참고)


