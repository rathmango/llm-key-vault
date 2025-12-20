# Tech Spec: 모바일 성능 최적화

## 개요
아내를 위한 AI 챗 앱의 모바일 웹 성능 최적화. 브라우저 리소스 최소화.

## 요구사항

### 1. 메시지 페이지네이션
- **문제**: 긴 대화 히스토리 전체 로드시 느려짐
- **해결**: 최근 20개만 초기 로드, 스크롤업시 추가 로드
- **구현**:
  - DB: `LIMIT 20 OFFSET n` 쿼리
  - API: `/api/sessions/[id]?limit=20&before=<message_id>`
  - UI: 스크롤 상단 도달시 이전 메시지 fetch

### 2. 오래된 메시지 접기
- **문제**: 긴 대화에서 상단 메시지가 DOM 차지
- **해결**: 초기 로드된 메시지 중 오래된 것은 접힌 상태
- **구현**:
  - 최근 5개만 펼침, 나머지는 "이전 메시지 N개 더 보기" 버튼
  - 버튼 클릭시 펼침 (이미 로드된 데이터)

### 3. Message Virtualization
- **문제**: 수백개 메시지 DOM 노드 → 렌더링 느림
- **해결**: 화면에 보이는 메시지만 DOM에 렌더
- **구현**:
  - `react-window` 또는 `@tanstack/react-virtual` 사용
  - 각 메시지 높이 동적 측정

## 구현 순서
1. 메시지 페이지네이션 (API + UI)
2. 오래된 메시지 접기 (UI만)
3. Virtualization (선택사항 - 1,2로 충분할 수 있음)

## 파일 변경 예상
- `web/src/app/api/sessions/[id]/route.ts` - 페이지네이션 파라미터
- `web/src/app/page.tsx` - 스크롤 핸들러, 접기 UI
- `package.json` - virtualization 라이브러리 (필요시)

