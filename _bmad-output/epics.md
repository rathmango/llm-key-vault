---
stepsCompleted:
  - draft-v1
inputDocuments:
  - _bmad-output/prd.md
  - _bmad-output/architecture.md
---

# 251220_bmad - Epic Breakdown

## Overview

이 문서는 PRD/Architecture(UX가 있으면 포함)에서 요구사항을 추출하여 **구현 가능한 Epic/Story**로 분해합니다.

## Requirements Inventory

### Functional Requirements

FR1: Provider별 API Key를 저장/수정/삭제할 수 있다.
FR2: Key는 Keychain에 저장되며, 앱 내부에서 평문으로 장기 보관하지 않는다.
FR3: Key 입력 UI는 마스킹/복사 제한/로그 차단 등 노출을 최소화한다.
FR4: Provider별로 엔드포인트/모델을 설정할 수 있다(기본값 제공).
FR5: Key 연결 테스트(인증 실패/레이트리밋/네트워크 오류 포함)를 제공한다.
FR6: 단일 Provider로 프롬프트를 보내고 응답을 표시한다.
FR7: 멀티 실행 모드에서 선택된 Provider들에 동시 요청을 보낸다.
FR8: 요청/응답 내역을 세션 단위로 저장하고, 사용자가 삭제할 수 있다(옵션).
FR9: Provider 추가가 쉬운 구조(Adapter/Protocol 기반)를 갖는다.
FR10: MVP에서 최소 OpenAI + Anthropic을 지원한다.
FR11: (옵션/macOS) 로컬 HTTP 서버로 OpenAI 호환 일부 엔드포인트를 제공한다.
FR12: (옵션/macOS) 로컬 프록시는 토큰 기반 접근 제어를 제공한다.
FR13: (옵션/macOS) 프록시는 요청을 Provider로 중계하며 Key는 로컬에서만 사용한다.

### NonFunctional Requirements

NFR1: 보안/프라이버시: 키/프롬프트/응답은 기본 기기 내 저장, 외부 전송은 Provider 호출에 한정.
NFR2: 안정성: 네트워크/레이트리밋/모델 미지원 시 명확한 오류 표시.
NFR3: 성능: 멀티 실행은 병렬 호출로 처리.
NFR4: 감사 가능성: 키 자체는 표시하지 않되 lastUsedAt/성공·실패 메타는 제공.
NFR5: 플랫폼: macOS + iPadOS(Apple Silicon/M1+) 지원.

### Additional Requirements

- Keychain 저장 시 서비스명/계정명 규칙 정의(ProviderID 기반)
- 요청/에러 로그에서 Authorization 헤더 및 키 문자열 마스킹
- Provider Adapter는 JSON 인코딩/디코딩을 명확히 분리
- 비교 실행은 부분 실패를 허용(실패한 Provider만 오류 카드 표시)
- (옵션) iCloud Keychain 동기화 토글 제공
- (옵션/macOS) 로컬 프록시는 localhost 바인딩 및 토큰 인증 필수

### FR Coverage Map

- Epic 1: FR2, FR3, FR9 + NFR1/NFR4
- Epic 2: FR1, FR3, FR4, FR5
- Epic 3: FR6, FR10 (OpenAI)
- Epic 4: FR6, FR10 (Anthropic)
- Epic 5: FR6, FR8
- Epic 6: FR7
- Epic 7(Optional/macOS): FR11, FR12, FR13

## Epic List

1) Foundation & Security Core
2) Provider Key Management (UI + Config)
3) OpenAI Integration
4) Anthropic Integration
5) Chat Sessions
6) Compare Mode
7) (Optional/macOS) Local Proxy

## Epic 1: Foundation & Security Core

앱 전반에서 “키는 절대 노출되지 않는다”를 기본값으로 만드는 기반 작업.

### Story 1.1: Core Domain Models & Provider Catalog

As a 개발자,
I want Provider/모델/요청·응답 공통 모델을 정의하고,
So that Provider별 구현을 일관된 방식으로 확장할 수 있다.

**Acceptance Criteria:**

**Given** ProviderID와 ChatRequest/ChatResponse 모델이 정의되어 있고
**When** 새로운 Provider를 추가하려고 할 때
**Then** Adapter 구현만 추가하면 최소 기능이 동작하도록 설계되어야 한다

### Story 1.2: Keychain SecretStore

As a 사용자,
I want API Key가 Keychain에 안전하게 저장되고,
So that 파일/로그/메모리에 키가 남는 위험을 줄일 수 있다.

**Acceptance Criteria:**

**Given** 사용자가 OpenAI 키를 입력했고
**When** 저장을 누르면
**Then** 키는 Keychain에 저장되고 앱 저장소(UserDefaults/파일)에는 평문이 남지 않는다

### Story 1.3: Secret Redaction & Masking

As a 개발자,
I want 모든 에러/로그에서 키 문자열이 자동으로 마스킹되게 하고,
So that 실수로 키가 노출되는 사고를 예방한다.

**Acceptance Criteria:**

**Given** 네트워크 요청 실패가 발생했을 때
**When** 에러를 사용자에게 표시하거나 로그로 남길 때
**Then** Authorization 헤더 및 키 문자열은 절대 원문으로 출력되지 않는다

## Epic 2: Provider Key Management (UI + Config)

Provider별 키/엔드포인트/기본 모델 설정과 테스트를 제공.

### Story 2.1: Providers List & Detail UI

As a 사용자,
I want Provider 목록을 보고 각 Provider 설정으로 들어갈 수 있고,
So that 키를 한 곳에서 관리할 수 있다.

**Acceptance Criteria:**

**Given** 앱 설정 화면에 진입했을 때
**When** Provider를 선택하면
**Then** 해당 Provider의 키 상태(저장됨/없음), baseURL, 기본 모델 설정을 확인할 수 있다

### Story 2.2: API Key CRUD

As a 사용자,
I want 키를 안전하게 입력/저장/삭제할 수 있고,
So that 교체·회수가 쉬워진다.

**Acceptance Criteria:**

**Given** 사용자가 키 입력 필드에 값을 넣었을 때
**When** 저장을 누르면
**Then** 키는 마스킹된 상태로만 UI에 남고 Keychain에 저장된다

### Story 2.3: Provider Connection Test

As a 사용자,
I want 저장한 키가 유효한지 테스트하고,
So that 실제 사용 전에 오류를 줄일 수 있다.

**Acceptance Criteria:**

**Given** 사용자가 키를 저장했을 때
**When** 테스트를 실행하면
**Then** 성공/실패와 원인(인증/네트워크/레이트리밋)을 구분해 보여준다

## Epic 3: OpenAI Integration

### Story 3.1: OpenAI Chat Completions

As a 사용자,
I want OpenAI 모델에 프롬프트를 보내고,
So that 앱에서 바로 응답을 확인할 수 있다.

**Acceptance Criteria:**

**Given** OpenAI 키가 저장되어 있고 모델이 선택되었을 때
**When** 프롬프트를 전송하면
**Then** `/v1/chat/completions`로 요청하고 텍스트 응답을 화면에 표시한다

## Epic 4: Anthropic Integration

### Story 4.1: Anthropic Messages

As a 사용자,
I want Anthropic 모델에 프롬프트를 보내고,
So that OpenAI와 비교해서 사용할 수 있다.

**Acceptance Criteria:**

**Given** Anthropic 키가 저장되어 있고 모델이 선택되었을 때
**When** 프롬프트를 전송하면
**Then** `/v1/messages`로 요청하고 텍스트 응답을 화면에 표시한다

## Epic 5: Chat Sessions

### Story 5.1: Chat Screen (Single Provider)

As a 사용자,
I want 단일 Provider로 대화하듯 프롬프트/응답을 주고받고,
So that 일상적인 사용이 가능하다.

**Acceptance Criteria:**

**Given** 채팅 화면에서 Provider/모델이 선택되어 있을 때
**When** 사용자가 연속으로 메시지를 보내면
**Then** 메시지 히스토리가 화면에서 유지되고 다음 요청에 반영된다

### Story 5.2: Session Persistence (Optional)

As a 사용자,
I want 채팅 기록을 저장하거나 전체 삭제할 수 있고,
So that 개인 정보/보안 요구에 맞게 관리할 수 있다.

**Acceptance Criteria:**

**Given** 사용자가 저장 옵션을 켰을 때
**When** 앱을 재실행하면
**Then** 마지막 세션이 복원된다

**Given** 사용자가 전체 삭제를 실행하면
**When** 확인을 누르면
**Then** 로컬 저장된 세션 데이터가 삭제된다

## Epic 6: Compare Mode

### Story 6.1: Compare Mode Parallel Run

As a 사용자,
I want 여러 Provider/모델을 선택해 동일 프롬프트를 동시에 실행하고,
So that 결과를 빠르게 비교할 수 있다.

**Acceptance Criteria:**

**Given** 사용자가 2개 이상의 Provider/모델을 선택했을 때
**When** 실행을 누르면
**Then** 병렬로 요청이 전송되고 각 결과가 개별 카드로 표시된다

**Given** 일부 Provider 호출이 실패했을 때
**When** 결과가 표시될 때
**Then** 실패한 카드에는 오류가 표시되지만 성공한 카드들은 정상 표시된다

## Epic 7: (Optional/macOS) Local Proxy

### Story 7.1: Local Proxy (OpenAI-compatible)

As a macOS 사용자,
I want 로컬 엔드포인트로 OpenAI 호환 요청을 보낼 수 있고,
So that 외부 도구가 키를 직접 저장하지 않아도 된다.

**Acceptance Criteria:**

**Given** 프록시가 활성화되어 있고 토큰이 발급되었을 때
**When** 외부 클라이언트가 `POST /v1/chat/completions`를 호출하면
**Then** 토큰 검증 후 선택된 Provider로 중계하고 응답을 반환한다

### Story 7.2: Proxy Access Control & Settings

As a macOS 사용자,
I want 로컬 프록시 접근을 토큰으로 제한하고,
So that 임의의 앱이 무단으로 호출하지 못한다.

**Acceptance Criteria:**

**Given** 토큰이 없거나 틀렸을 때
**When** 프록시 요청이 들어오면
**Then** 401을 반환한다
