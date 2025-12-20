---
stepsCompleted: [1,2,3,4,5,6,7,8,9,10,11]
inputDocuments: []
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
lastStep: 11
project_name: '251220_bmad'
user_name: 'Mingyu'
date: '2025-12-20'
---

# Product Requirements Document - LLM Key Vault (Working Title)

**Author:** Mingyu
**Date:** 2025-12-20

## 1) 요약 (Executive Summary)

여러 LLM 서비스(OpenAI/Anthropic/Gemini/OpenRouter/Ollama 등)를 사용할 때, API Key는 각 앱/클라이언트에 흩어져 저장되고 관리가 어렵습니다. 이 프로젝트는 **웹앱(Safari/데스크톱 브라우저)** 형태로, **Supabase + Google Auth**로 로그인한 뒤 **사용자별 LLM API Key를 안전하게 저장**하고 **한 화면에서 즉시 전환/동시 실행(비교 실행)**할 수 있게 합니다.

LLM 호출은 브라우저에서 직접 호출(CORS/키 노출 위험)하지 않고, **서버(API routes)**가 저장된 키로 Provider API를 호출해 결과만 반환합니다.

## 2) 문제 정의

- API Key가 여러 앱/설정 화면에 분산되어 **관리/교체/회수**가 번거롭다.
- API Key 노출(스크린샷/로그/클립보드/환경변수 등) 위험이 높다.
- Provider별 모델/엔드포인트/요금/제한이 달라 **전환 비용**이 크다.
- 동일 프롬프트를 여러 모델에 비교 실행하려면 매번 설정을 바꿔야 한다.

## 3) 목표 (Goals)

- **G0. 로그인/사용자 분리**: Supabase Google Auth로 사용자별 공간을 분리한다.
- **G1. 안전한 Key 관리**: Supabase(Postgres)에 **암호화 저장** + RLS로 사용자별 접근 제어.
- **G2. 단일 화면에서 Provider 전환**: Provider/모델을 빠르게 전환해 사용.
- **G3. 동시 실행/비교**: 한 프롬프트를 여러 Provider/모델에 동시에 보내 결과를 나란히 비교.
- **G4. 서버 프록시 호출**: 서버가 키로 Provider API를 호출해 브라우저의 CORS/키 노출 위험을 줄인다.

## 4) 비목표 (Non-Goals)

- N1. 팀 공유(조직 내 여러 사용자 공유)용 중앙 서버/관리 콘솔은 MVP 범위 밖.
- N2. 결제/구독/크레딧 관리 자동화(Provider billing API 연동)는 초기 범위 밖.
- N3. 완전한 플러그인/확장(IDE 플러그인 등) 제공은 후순위.

## 5) 타겟 사용자 / 페르소나

- **P1. 개발자/메이커**: 여러 LLM을 개발/자동화에 사용, 키를 자주 교체/테스트.
- **P2. 리서처/PM/콘텐츠 제작자**: 같은 질문을 여러 모델에 던져 품질 비교.
- **P3. 보안 민감 사용자**: 키 노출을 최소화하고 기기 내에서만 안전하게 관리.

## 6) 핵심 사용자 여정 (User Journeys)

### J1. 첫 실행 / 온보딩
- (선택) 앱 잠금(생체/암호) 설정
- Provider 목록 확인
- 첫 API Key 추가 → 연결 테스트 → 저장

### J2. Provider Key 추가/수정/삭제
- Provider 선택(OpenAI/Anthropic/Gemini/OpenRouter/Ollama…)
- 키 입력(라벨/메모 선택)
- 테스트(인증/모델 목록/간단 호출)
- 저장(Keychain)

### J3. 단일 Provider로 채팅
- Provider + 모델 선택
- 프롬프트 입력
- 응답 표시(토큰/에러/요금 추정치)

### J4. 멀티 실행(비교 모드)
- 여러 Provider/모델을 체크박스로 선택
- 동일 프롬프트 동시 전송
- 결과를 그리드/탭으로 비교
- (선택) 결과 복사/내보내기(텍스트/마크다운)

### J5. (옵션) macOS 로컬 프록시
- 프록시 활성화(로컬 포트/접근 토큰 생성)
- OpenAI 호환 엔드포인트 표시
- 외부 도구에서 `Base URL`만 로컬로 바꾸어 사용

## 7) 기능 요구사항 (Functional Requirements)

### 7.1 Provider/Key 관리
- FR1. Provider별 API Key를 저장/수정/삭제할 수 있다.
- FR2. Key는 **Keychain**에 저장되며, 앱 내부에서 평문으로 장기 보관하지 않는다.
- FR3. Key 입력 UI는 마스킹/복사 제한/자동 로그 차단 등 노출을 최소화한다.
- FR4. Provider별로 엔드포인트/모델을 설정할 수 있다(기본값 제공).
- FR5. Key 연결 테스트(인증 실패/레이트리밋/네트워크 오류 포함)를 제공한다.

### 7.2 실행(채팅/요청)
- FR6. 단일 Provider로 프롬프트를 보내고 응답을 표시한다.
- FR7. 멀티 실행 모드에서 선택된 Provider들에 **동시 요청**을 보낸다.
- FR8. 요청/응답 내역을 세션 단위로 저장(기본: 로컬)하고, 사용자가 삭제할 수 있다(옵션).

### 7.3 모델/기능 확장성
- FR9. Provider 추가가 쉬운 구조(플러그인 유사: Adapter/Protocol 기반).
- FR10. OpenAI/Anthropic/Gemini 최소 2개 Provider는 MVP에서 지원(최소 OpenAI + Anthropic).

### 7.4 (옵션) 로컬 프록시(macOS)
- FR11. macOS에서 로컬 HTTP 서버를 띄워 OpenAI 호환 일부 엔드포인트를 제공한다.
- FR12. 로컬 프록시는 토큰 기반 접근 제어를 제공한다(임의 앱 접근 차단).
- FR13. 프록시는 요청을 Provider로 중계하며, Key는 로컬에서만 사용한다.

## 8) 비기능 요구사항 (NFR)

- NFR1. **보안/프라이버시**: 키/프롬프트/응답은 기본적으로 기기 내 저장. 외부 전송은 Provider 호출에 한정.
- NFR2. **안정성**: 네트워크 오류/레이트리밋/모델 미지원 시 사용자에게 명확한 오류 표시.
- NFR3. **성능**: 멀티 실행 시 동시성(TaskGroup)으로 병렬 호출.
- NFR4. **감사 가능성**: 키 자체는 표시하지 않되, 마지막 사용 시각/성공/실패 로그(키를 제외한 메타) 제공.
- NFR5. **플랫폼**: macOS + iPadOS 지원(Apple Silicon/M1 이상을 타겟으로 설정).

## 9) 데이터/저장소 설계(초안)

- **Secrets(키)**: Keychain 항목으로 저장(Provider + Key ID).
- **메타데이터(라벨/선택 모델/정렬/설정)**: UserDefaults 또는 SQLite/CoreData.
- **채팅 세션(선택)**: 로컬 DB 저장 + 전체 삭제 기능.

## 10) 보안 설계(초안)

- 키는 화면에 전체 노출하지 않고, 기본은 "표시 안 함".
- 로그/크래시 리포트에 키가 포함되지 않도록 모든 네트워크/에러 메시지에서 **키 문자열을 필터링**.
- 클립보드 복사 기능은 기본 비활성 또는 타임아웃(선택).
- (옵션) 앱 잠금(생체/암호)으로 설정 화면 보호.
- (옵션) Keychain iCloud 동기화는 사용자 선택(보안/편의 트레이드오프 명시).

## 11) MVP 범위

- MVP1. Provider 목록 + Keychain 저장 + 연결 테스트
- MVP2. 단일 Provider 채팅(OpenAI + Anthropic)
- MVP3. 멀티 실행(비교) 기본 UI
- MVP4. 기본 설정(기본 모델/엔드포인트)

## 12) 후속(확장) 아이디어

- 비용/토큰 추적 대시보드(Provider별 사용량)
- 프롬프트 템플릿/변수
- 스트리밍 응답
- macOS 메뉴바 모드/백그라운드 프록시
- OpenRouter/로컬 Ollama 연동

## 13) 가정/미결정(Assumptions & Open Questions)

- A1. 앱은 “키 관리 + 한 앱에서 실행/비교”가 1차 가치이며, 로컬 프록시는 2차 옵션으로 둔다.
- A2. 초기 Provider는 OpenAI/Anthropic 중심으로 시작한다.
- Q1. 앱 배포는 App Store 우선인가(샌드박스/백그라운드 제약 영향)?
- Q2. iPad에서 로컬 프록시 기능이 필요한가(백그라운드 제약 큼)?
- Q3. 채팅 기록을 반드시 저장해야 하는가, 아니면 세션 단발로 충분한가?
