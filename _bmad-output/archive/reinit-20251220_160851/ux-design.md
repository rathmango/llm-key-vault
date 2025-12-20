# UX Design - LLM Key Vault (Working Title)

**Platforms:** macOS + iPadOS (SwiftUI)

## 1) IA (Information Architecture)

- **Providers**
  - Provider 리스트
  - Provider 상세(키/엔드포인트/모델/테스트)
- **Chat**
  - 단일 Provider 채팅
- **Compare**
  - 멀티 Provider/모델 선택 + 결과 비교
- **Settings**
  - 보안(앱 잠금/키 표시 정책/클립보드)
  - 동기화(iCloud Keychain 토글)
  - (macOS) 로컬 프록시

## 2) 핵심 UX 원칙

- **키는 기본적으로 절대 보여주지 않는다** (마지막 4자리만)
- 사용자가 원할 때만 제한적으로 **Reveal(표시)** 가능 + (옵션) 생체/암호 확인
- “저장”보다 “테스트→저장” 흐름을 강조(실패 원인 명확히)
- 비교 모드는 “결과 비교가 쉬운 레이아웃”이 핵심(카드/그리드)

## 3) 화면 설계

### 3.1 Providers (좌측 리스트 + 우측 상세)

**좌측 리스트**
- OpenAI, Anthropic, Gemini, OpenRouter, Ollama …
- 각 항목에 상태 배지:
  - ✅ Key 저장됨
  - ⚠️ 테스트 실패/만료
  - ➕ 미설정

**우측 상세**
- API Key 입력 필드(마스킹)
- 버튼: `Test`, `Save`, `Delete`
- Advanced:
  - Base URL
  - Default Model
  - (옵션) 동기화(iCloud Keychain)

**상태 메시지**
- 성공: “연결 성공”
- 실패: “인증 실패(401) / 레이트리밋(429) / 네트워크 오류” 등으로 구분

### 3.2 Chat

- 상단: Provider Picker + Model Picker
- 메시지 리스트(사용자/모델)
- 입력창 + Send
- 하단(옵션): 토큰/요금 추정, 최근 오류

### 3.3 Compare

- 상단: Provider/Model 다중 선택(체크리스트)
- 입력창 + Run
- 결과 영역:
  - iPad: 2~3열 그리드(가로/세로 회전 대응)
  - macOS: 2~4열 리사이즈 그리드
- 각 카드:
  - Provider/Model
  - 응답 텍스트
  - 상태(성공/실패/로딩)
  - 복사 버튼(옵션)

### 3.4 Settings

- 보안
  - 앱 잠금(생체/암호)
  - 키 Reveal 정책(항상 숨김/요청 시 잠금 해제)
  - 클립보드 복사 허용(기본 OFF) + 만료 시간
- 동기화
  - iCloud Keychain 동기화(기본 OFF)
- (macOS) 로컬 프록시
  - 토글: Enable Proxy
  - 표시: Base URL, Token(복사), 상태

## 4) 접근성/품질

- Dynamic Type 대응
- VoiceOver 레이블(특히 버튼/상태)
- 색상만으로 상태 전달 금지(아이콘+텍스트)

## 5) 에러/로딩 UX

- 테스트/요청 시 로딩 인디케이터
- 실패 시 재시도 버튼
- 네트워크/인증 실패 원인 분리 표시
