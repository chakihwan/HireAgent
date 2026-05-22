# HireAgent M1 첫주 실행 가이드

> **목표**: 1주 안에 "Docker Compose로 모든 서비스 뜨고, API 키 입력해서 LLM 호출 가능, 이력서 RAG 검색 가능"한 상태 만들기
> **작업 순서**: A → B → C (Docker → LLM Factory → Next.js)

---

## Day 0 (오늘): 환경 확인 & GitHub 셋업

### 0.1 환경 체크 (이미 다 있을 듯)
```bash
# WSL2 Ubuntu에서
docker --version           # 이미 있음
docker compose version     # v2 이상
node --version             # v20 이상 권장
python --version           # 3.11+
git --version
```

### 0.2 GitHub 레포 생성
```bash
# GitHub.com에서 생성:
# - 이름: hireagent
# - Private
# - .gitignore: Python (나중에 Node 추가)
# - License: MIT (나중에 추가 가능)
# - README: 체크

# 로컬에 클론
cd ~/workspace  # 또는 D:/workspace
git clone https://github.com/YOUR_USERNAME/hireagent.git
cd hireagent
```

### 0.3 기본 폴더 구조
```bash
mkdir -p backend/app/{api,agents,llm/providers,rag/loaders,models,schemas,services,utils}
mkdir -p frontend
mkdir -p docs/adr
mkdir -p scripts

touch backend/app/__init__.py
touch backend/app/main.py
touch .env.example
touch docker-compose.yml
```

---

## Day 1-2 (A): Docker Compose 환경

### A.1 `docker-compose.yml` 작성
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: hireagent-postgres
    environment:
      POSTGRES_USER: hireagent
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme}
      POSTGRES_DB: hireagent
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hireagent"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: hireagent-backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://hireagent:${POSTGRES_PASSWORD:-changeme}@postgres:5432/hireagent
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      OLLAMA_BASE_URL: http://host.docker.internal:11434
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: hireagent-frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
    command: npm run dev

volumes:
  postgres_data:
```

### A.2 `.env.example`
```env
# PostgreSQL
POSTGRES_PASSWORD=changeme

# API 키 암호화 키 (운영 시 반드시 변경)
# 생성: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your-fernet-key-here

# Ollama (선택)
OLLAMA_BASE_URL=http://localhost:11434
```

### A.3 `.gitignore`
```
# Python
__pycache__/
*.py[cod]
.venv/
.env
*.egg-info/

# Node
node_modules/
.next/
out/
dist/
build/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Project
*.log
.env.local
.env.production
backend/uploads/
```

### A.4 백엔드 `Dockerfile`
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    fastapi[all] \
    uvicorn \
    sqlalchemy \
    psycopg2-binary \
    alembic \
    pgvector \
    pydantic-settings \
    cryptography \
    anthropic \
    openai \
    google-generativeai \
    ollama \
    langchain \
    langgraph \
    sentence-transformers

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### A.5 백엔드 `app/main.py` (최소 동작본)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HireAgent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "HireAgent API is running", "version": "0.1.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
```

### A.6 동작 확인
```bash
# 환경변수 생성
cp .env.example .env
# .env 파일 열어서 ENCRYPTION_KEY 생성해서 넣기

# 컨테이너 띄우기 (frontend는 아직 없으니 backend만)
docker compose up postgres backend

# 다른 터미널에서 확인
curl http://localhost:8000/
curl http://localhost:8000/health
```

**Day 1-2 완료 기준**: `curl http://localhost:8000/health` 가 200 반환

---

## Day 3-4 (B): LLM Factory

### B.1 추상 베이스 클래스
```python
# backend/app/llm/base.py
from abc import ABC, abstractmethod
from typing import AsyncIterator

class LLMProvider(ABC):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
    
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> str:
        ...
    
    @abstractmethod
    async def stream(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        ...
```

### B.2 Anthropic 프로바이더
```python
# backend/app/llm/providers/anthropic.py
from anthropic import AsyncAnthropic
from app.llm.base import LLMProvider

class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-haiku-4-5-20251001"):
        super().__init__(api_key, model)
        self.client = AsyncAnthropic(api_key=api_key)
    
    async def generate(self, prompt, system=None, max_tokens=1000, temperature=0.7):
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text
    
    async def stream(self, prompt, system=None, max_tokens=1000, temperature=0.7):
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
```

### B.3 Ollama 프로바이더
```python
# backend/app/llm/providers/ollama.py
import httpx
from app.llm.base import LLMProvider

class OllamaProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "exaone3.5:7.8b"):
        # api_key 자리에 endpoint URL 사용
        super().__init__(api_key, model)
        self.base_url = api_key.rstrip("/")
    
    async def generate(self, prompt, system=None, max_tokens=1000, temperature=0.7):
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            }
        }
        if system:
            payload["system"] = system
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json=payload
            )
            response.raise_for_status()
            return response.json()["response"]
    
    async def stream(self, prompt, system=None, max_tokens=1000, temperature=0.7):
        # 구현 생략 (필요 시 확장)
        ...
```

### B.4 팩토리
```python
# backend/app/llm/factory.py
from app.llm.base import LLMProvider
from app.llm.providers.anthropic import AnthropicProvider
from app.llm.providers.ollama import OllamaProvider

PROVIDERS = {
    "anthropic": AnthropicProvider,
    "ollama": OllamaProvider,
    # "openai": OpenAIProvider,  # 나중에 추가
    # "google": GoogleProvider,
}

class LLMFactory:
    @staticmethod
    def create(provider: str, model: str, api_key: str) -> LLMProvider:
        if provider not in PROVIDERS:
            raise ValueError(f"Unknown provider: {provider}")
        return PROVIDERS[provider](api_key=api_key, model=model)
```

### B.5 테스트용 엔드포인트
```python
# backend/app/api/v1/llm_test.py
from fastapi import APIRouter
from pydantic import BaseModel
from app.llm.factory import LLMFactory

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])

class LLMTestRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    prompt: str

@router.post("/test")
async def test_llm(req: LLMTestRequest):
    llm = LLMFactory.create(req.provider, req.model, req.api_key)
    result = await llm.generate(req.prompt, max_tokens=200)
    return {"response": result}
```

### B.6 main.py에 라우터 등록
```python
from app.api.v1 import llm_test

app.include_router(llm_test.router)
```

### B.7 동작 확인
```bash
# 컨테이너 재시작
docker compose restart backend

# Claude API 테스트
curl -X POST http://localhost:8000/api/v1/llm/test \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "claude-haiku-4-5-20251001",
    "api_key": "sk-ant-YOUR_KEY",
    "prompt": "안녕하세요"
  }'

# Ollama 테스트 (Ollama 띄워져 있어야 함)
curl -X POST http://localhost:8000/api/v1/llm/test \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "model": "exaone3.5:7.8b",
    "api_key": "http://host.docker.internal:11434",
    "prompt": "안녕하세요"
  }'
```

**Day 3-4 완료 기준**: Claude + Ollama 둘 다 API 호출 성공

---

## Day 5-7 (C): Next.js 초기화

### C.1 Next.js 프로젝트 생성
```bash
cd frontend

# 대화형 셋업 (모든 옵션 yes/기본값)
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint \
  --turbopack

# shadcn/ui 설치
npx shadcn@latest init

# 기본 컴포넌트 설치
npx shadcn@latest add button input card textarea
```

### C.2 프론트엔드 `Dockerfile`
```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### C.3 백엔드 API 클라이언트 골격
```typescript
// frontend/src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function testLLM(
  provider: string,
  model: string,
  apiKey: string,
  prompt: string
) {
  const res = await fetch(`${API_URL}/api/v1/llm/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, api_key: apiKey, prompt }),
  });
  if (!res.ok) throw new Error('LLM test failed');
  return res.json();
}
```

### C.4 테스트 페이지
```tsx
// frontend/src/app/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { testLLM } from '@/lib/api';

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('안녕하세요');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    try {
      const result = await testLLM(
        'anthropic',
        'claude-haiku-4-5-20251001',
        apiKey,
        prompt
      );
      setResponse(result.response);
    } catch (e) {
      setResponse(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container mx-auto p-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">HireAgent</h1>
      <Card className="p-6 space-y-4">
        <Input
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <Textarea
          placeholder="프롬프트를 입력하세요"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <Button onClick={handleTest} disabled={loading || !apiKey}>
          {loading ? '생성 중...' : 'Claude 호출'}
        </Button>
        {response && (
          <div className="mt-4 p-4 bg-muted rounded">
            <pre className="whitespace-pre-wrap">{response}</pre>
          </div>
        )}
      </Card>
    </main>
  );
}
```

### C.5 전체 띄우기
```bash
docker compose up

# 브라우저에서 http://localhost:3000 접속
# API 키 넣고 Claude 호출 테스트
```

**Day 5-7 완료 기준**: 브라우저에서 API 키 입력 → Claude 응답 받기 성공

---

## M1 완료 기준 체크리스트

- [ ] GitHub 레포 생성 및 첫 커밋
- [ ] `docker compose up` 한 번에 PostgreSQL + Backend + Frontend 뜨기
- [ ] `pgvector` 확장 활성화된 DB 동작
- [ ] FastAPI `/health` 엔드포인트 응답
- [ ] LLM Factory에서 Anthropic + Ollama 호출 성공
- [ ] Next.js 페이지에서 API 키 입력 → Claude 호출 → 응답 표시
- [ ] 살아있는 문서 워크플로우: `docs/CHANGELOG.md`에 매일 변경사항 기록

---

## M1 이후 (M2 미리보기)

다음 주부터는:
- `agents/` 디렉토리에 LangGraph 노드 구현
- `rag/` 디렉토리에 이력서 인덱싱
- 글자수 검증 유틸리티
- 자소서 생성 API 엔드포인트

---

## 트러블슈팅 메모

### Docker Compose 자주 나오는 이슈
- **포트 충돌**: 5432(postgres), 8000(backend), 3000(frontend), 11434(ollama)
- **WSL2에서 host.docker.internal**: `extra_hosts: ["host.docker.internal:host-gateway"]` 필요할 수 있음
- **권한 문제**: `sudo` 없이 docker 쓰려면 `sudo usermod -aG docker $USER` 후 재로그인

### pgvector 확장 활성화
```sql
-- Alembic 마이그레이션 첫 단계에서 실행
CREATE EXTENSION IF NOT EXISTS vector;
```

### Next.js + Docker 핫리로드 안 될 때
- `next.config.js`에 webpack polling 설정 추가
```js
module.exports = {
  webpackDevMiddleware: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};
```
