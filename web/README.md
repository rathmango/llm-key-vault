## LLM Key Vault (Web)

내 API Key(OpenAI/Anthropic)를 Supabase에 **암호화 저장**하고, 웹에서 채팅/비교를 할 수 있는 Next.js 앱입니다.

추가 기능:
- **Web 검색**: 채팅 상단의 **“Web 검색”** 토글을 켜면, 서버가 OpenAI Responses API의 built-in **`web_search` tool**로 검색을 수행하고 **Sources(출처)** 를 함께 표시합니다.

## Getting Started

### 환경 변수

`env.sample`을 참고해서 환경 변수를 설정하세요.

로컬 개발에서는 보통 `web/.env.local`(gitignore됨)에 넣습니다.

필수:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLMKV_ENCRYPTION_KEY`

Web 검색(선택):
- (추가 키 없음) OpenAI built-in web search 사용

YouTube 추천(선택):
- `YOUTUBE_DATA_API_KEY` (서버 전용) — Home 탭의 “추천 영상 카드(썸네일/제목)”에 사용

### 개발 서버 실행

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

