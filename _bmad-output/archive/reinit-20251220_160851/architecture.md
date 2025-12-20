---
stepsCompleted: [1,2,3,4,5,6,7,8]
inputDocuments:
  - _bmad-output/prd.md
workflowType: 'architecture'
lastStep: 8
project_name: '251220_bmad'
user_name: 'Mingyu'
date: '2025-12-20'
---

# Architecture - LLM Key Vault (Working Title)

**Scope:** 웹앱(데스크톱 + iPad Safari) + Supabase(Google Auth)

## 1) 아키텍처 목표

- **보안 우선**: API Key는 DB에 **암호화 저장(AES-GCM)**, 앱/로그에 평문이 남지 않게 설계
- **확장성**: Provider 추가가 쉬운 구조(Adapter/Route 분리)
- **동시성**: 멀티 실행(비교) 시 서버에서 병렬 호출
- **분리**: UI(React) ↔ API(Route handlers) ↔ Supabase(DB/Auth) 분리

## 2) 상위 구조

- `web/` (Next.js App Router)
  - UI: Keys / Chat / Compare 탭
  - Auth: Supabase Google OAuth
  - API: `/api/keys`, `/api/chat`, `/api/compare`

- `Supabase`
  - Auth: Google OAuth, 사용자 세션
  - DB: `api_keys` 테이블(RLS 적용)

## 3) 모듈/책임 분리

### 3.1 도메인 모델

- `ProviderID`: `openai | anthropic | gemini | openrouter | ollama | custom`
- `ProviderConfig`
  - `baseURL`, `defaultModel`, `supportsStreaming`, `extraHeaders` 등
- `APIKeyReference`
  - 메타(라벨, createdAt, lastUsedAt)
  - **실제 키 문자열은 저장하지 않음** (Keychain key로만 참조)
- `ChatMessage` (role, content)
- `ChatRequest` (provider, model, messages, temperature, maxTokens …)
- `ChatResponse` (text, usage, rawMetadata)

### 3.2 키 저장소(Supabase + 암호화)

- 테이블: `public.api_keys`
  - `encrypted_key`: AES-256-GCM envelope(`v1:iv:tag:ciphertext`)
  - `key_hint`: UI 표시용(예: `****1234`)
- RLS: `auth.uid() = user_id` 정책으로 사용자별 접근 제어
- 서버(API routes)가 키를 복호화해 Provider API를 호출 (브라우저 직접 호출 X)

### 3.3 Provider Adapter

- `ProviderAdapter` 프로토콜
  - `func send(request: ChatRequest, apiKey: String) async throws -> ChatResponse`
- 구현체:
  - `OpenAIAdapter` (`/v1/chat/completions` 또는 `/v1/responses` 중 MVP는 chat-completions)
  - `AnthropicAdapter` (`/v1/messages`)
  - `GeminiAdapter` (`/v1beta/models/...:generateContent`)

### 3.4 네트워크 계층

- `HTTPClient` (URLSession 기반)
  - 공통 리트라이/타임아웃/에러 매핑
  - **요청 로그에 키/민감 데이터 포함 금지**

### 3.5 멀티 실행(비교) 실행기

- `ComparisonRunner`
  - 입력: 동일 prompt + (provider, model) 조합 목록
  - `withThrowingTaskGroup`로 병렬 실행
  - 결과 매핑/정렬/부분 실패 처리(일부 실패해도 나머지 결과 표시)

## 4) 데이터 저장

- Key 메타/설정/세션 기록
  - MVP: `UserDefaults` + 간단한 Codable 저장
  - 확장: `SwiftData`(iOS 17+/macOS 14+) 또는 SQLite

## 5) UI(초안)

- **Settings/Providers**
  - Provider 목록(좌측) + 선택 Provider 상세(우측)
  - API Key 입력/마스킹/테스트/저장
  - Base URL/모델 기본값

- **Chat**
  - 단일 모드: Provider/모델 선택 → 대화
  - 비교 모드: Provider/모델 체크 → 동시 실행 → 카드/그리드 결과

## 6) 보안/프라이버시

- Key는 Keychain 외에 저장하지 않음(파일/DB/로그/크래시 리포트 금지)
- UI에서 전체 키를 기본 표시하지 않음(“마지막 4자리” 정도만)
- 클립보드 복사는 기본 비활성 또는 자동 만료(옵션)
- 네트워크 에러/디버그 로그는 키/Authorization 헤더를 마스킹

## 7) macOS/iPadOS 고려사항

- 멀티플랫폼 SwiftUI
  - 공통 화면 + 플랫폼별 분기(메뉴/단축키/사이드바 등)
- iPadOS
  - 백그라운드 제약으로 로컬 프록시는 기본 비활성(옵션/제한 명시)
- macOS
  - 옵션으로 메뉴바 앱 + 로컬 프록시(사용자 동의 시)

## 8) (Optional) 로컬 프록시 설계

- 제공 API: OpenAI 호환 일부
  - `POST /v1/chat/completions`
- 접근 제어
  - 로컬 토큰(랜덤) + 헤더(`Authorization: Bearer <token>`)
  - 포트 바인딩은 localhost 기본
- 라우팅
  - `model` 또는 `x-provider` 같은 규칙으로 Provider 선택

## 9) 리스크/대응

- Provider API 스펙 변경 → Adapter 계층으로 영향 최소화
- 키 노출 사고 → Keychain + 마스킹 + 로그 필터링
- App Store 정책/샌드박스 → 프록시는 옵션으로 분리(특히 iPad)
