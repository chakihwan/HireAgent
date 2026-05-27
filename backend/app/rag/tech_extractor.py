"""기술 키워드 자동 추출.

청크 텍스트에서 사전 정의된 기술 키워드를 매칭해 tech_stack을 자동 추출한다.
LLM을 사용하지 않아 빠르고 비용 없음. README/이력서/자소서 모두 대응.
"""

import re

# ─── 사전 정의 기술 키워드 ──────────────────────────────────────────
# 매칭 우선순위: 긴 문자열 먼저 (예: "FastAPI" → "Fast" 매칭 안 되게)
# 표준 표기로 정규화 (DB에는 표준 표기로 저장)

# (정규식 패턴, 표준 표기)
_TECH_PATTERNS: list[tuple[str, str]] = [
    # 언어
    (r"\bPython\b", "Python"),
    (r"\bJavaScript\b", "JavaScript"),
    (r"\bTypeScript\b", "TypeScript"),
    (r"\bJava\b(?!Script)", "Java"),
    (r"\bKotlin\b", "Kotlin"),
    (r"\bSwift\b", "Swift"),
    (r"\bGo(?:lang)?\b", "Go"),
    (r"\bRust\b", "Rust"),
    (r"\bC\+\+", "C++"),
    (r"\bC#\b", "C#"),
    (r"\bRuby\b", "Ruby"),
    (r"\bPHP\b", "PHP"),
    (r"\bScala\b", "Scala"),
    (r"\bR\b(?!ust|uby|eact)", "R"),

    # 백엔드 프레임워크
    (r"\bFastAPI\b", "FastAPI"),
    (r"\bDjango\b", "Django"),
    (r"\bFlask\b", "Flask"),
    (r"\bSpring\s*Boot\b", "Spring Boot"),
    (r"\bSpring\b(?!\s*Boot)", "Spring"),
    (r"\bExpress(?:\.js)?\b", "Express"),
    (r"\bNestJS\b", "NestJS"),
    (r"\bNode\.?js\b", "Node.js"),
    (r"\bRails\b", "Rails"),
    (r"\bASP\.NET\b", "ASP.NET"),
    (r"\bLaravel\b", "Laravel"),

    # 프론트엔드
    (r"\bReact\b(?!\s*Native)", "React"),
    (r"\bReact\s*Native\b", "React Native"),
    (r"\bVue(?:\.js)?\b", "Vue"),
    (r"\bAngular\b", "Angular"),
    (r"\bNext\.?js\b", "Next.js"),
    (r"\bNuxt(?:\.js)?\b", "Nuxt"),
    (r"\bSvelte(?:Kit)?\b", "Svelte"),
    (r"\bTailwind(?:CSS)?\b", "TailwindCSS"),
    (r"\bRedux\b", "Redux"),
    (r"\bZustand\b", "Zustand"),
    (r"\bjQuery\b", "jQuery"),

    # 데이터베이스
    (r"\bPostgreSQL\b", "PostgreSQL"),
    (r"\bPostgres\b(?!QL)", "PostgreSQL"),
    (r"\bMySQL\b", "MySQL"),
    (r"\bMariaDB\b", "MariaDB"),
    (r"\bSQLite\b", "SQLite"),
    (r"\bMongoDB\b", "MongoDB"),
    (r"\bRedis\b", "Redis"),
    (r"\bCassandra\b", "Cassandra"),
    (r"\bDynamoDB\b", "DynamoDB"),
    (r"\bElasticsearch\b", "Elasticsearch"),
    (r"\bClickHouse\b", "ClickHouse"),
    (r"\bpgvector\b", "pgvector"),
    (r"\bChroma(?:DB)?\b", "Chroma"),
    (r"\bPinecone\b", "Pinecone"),
    (r"\bWeaviate\b", "Weaviate"),
    (r"\bMilvus\b", "Milvus"),
    (r"\bQdrant\b", "Qdrant"),

    # 메시징/스트리밍
    (r"\bKafka\b", "Kafka"),
    (r"\bRabbitMQ\b", "RabbitMQ"),
    (r"\bNATS\b", "NATS"),
    (r"\bRedis\s*Streams?\b", "Redis Streams"),
    (r"\bAWS\s*SQS\b", "SQS"),
    (r"\bAWS\s*SNS\b", "SNS"),
    (r"\bCelery\b", "Celery"),

    # 클라우드 / 인프라
    (r"\bAWS\b", "AWS"),
    (r"\bGCP\b", "GCP"),
    (r"\bAzure\b", "Azure"),
    (r"\b(?:Amazon\s+)?S3\b", "S3"),
    (r"\bEC2\b", "EC2"),
    (r"\bLambda\b", "AWS Lambda"),
    (r"\bECS\b", "ECS"),
    (r"\bEKS\b", "EKS"),
    (r"\bCloudFront\b", "CloudFront"),
    (r"\bCloudFlare\b", "Cloudflare"),
    (r"\bDocker\b", "Docker"),
    (r"\bdocker[\s-]?compose\b", "Docker Compose"),
    (r"\bKubernetes\b", "Kubernetes"),
    (r"\bK8s\b", "Kubernetes"),
    (r"\bHelm\b", "Helm"),
    (r"\bTerraform\b", "Terraform"),
    (r"\bAnsible\b", "Ansible"),
    (r"\bNginx\b", "Nginx"),
    (r"\bApache\b", "Apache"),
    (r"\bVercel\b", "Vercel"),
    (r"\bRailway\b", "Railway"),
    (r"\bFly\.io\b", "Fly.io"),
    (r"\bHeroku\b", "Heroku"),
    (r"\bSupabase\b", "Supabase"),
    (r"\bFirebase\b", "Firebase"),

    # CI/CD / 도구
    (r"\bGitHub\s*Actions\b", "GitHub Actions"),
    (r"\bGitLab\s*CI\b", "GitLab CI"),
    (r"\bJenkins\b", "Jenkins"),
    (r"\bCircleCI\b", "CircleCI"),
    (r"\bArgoCD\b", "ArgoCD"),
    (r"\bGit\b(?!Hub|Lab)", "Git"),

    # AI/ML
    (r"\bPyTorch\b", "PyTorch"),
    (r"\bTensorFlow\b", "TensorFlow"),
    (r"\bscikit-learn\b", "scikit-learn"),
    (r"\bKeras\b", "Keras"),
    (r"\bJAX\b", "JAX"),
    (r"\bHugging\s*Face\b", "HuggingFace"),
    (r"\btransformers\b", "transformers"),
    (r"\bLangChain\b", "LangChain"),
    (r"\bLangGraph\b", "LangGraph"),
    (r"\bLlamaIndex\b", "LlamaIndex"),
    (r"\bOpenAI\b", "OpenAI API"),
    (r"\bAnthropic\b", "Anthropic API"),
    (r"\bClaude\b", "Claude"),
    (r"\bGPT[\s-]?[0-9]?\b", "GPT"),
    (r"\bGemini\b", "Gemini"),
    (r"\bOllama\b", "Ollama"),
    (r"\bvLLM\b", "vLLM"),
    (r"\bRAG\b", "RAG"),
    (r"\bMLOps\b", "MLOps"),
    (r"\bMLflow\b", "MLflow"),
    (r"\bWeights\s*&?\s*Biases\b", "W&B"),
    (r"\bWandb\b", "W&B"),
    (r"\bAirflow\b", "Airflow"),
    (r"\bPrefect\b", "Prefect"),
    (r"\bRay\b", "Ray"),

    # 데이터 처리
    (r"\bpandas\b", "pandas"),
    (r"\bNumPy\b", "NumPy"),
    (r"\bSpark\b", "Spark"),
    (r"\bHadoop\b", "Hadoop"),
    (r"\bDuckDB\b", "DuckDB"),
    (r"\bdbt\b", "dbt"),

    # API / 통신
    (r"\bGraphQL\b", "GraphQL"),
    (r"\bREST\b", "REST API"),
    (r"\bgRPC\b", "gRPC"),
    (r"\bWebSocket\b", "WebSocket"),
    (r"\bSSE\b", "SSE"),

    # ORM / 백엔드 도구
    (r"\bSQLAlchemy\b", "SQLAlchemy"),
    (r"\bPrisma\b", "Prisma"),
    (r"\bTypeORM\b", "TypeORM"),
    (r"\bAlembic\b", "Alembic"),
    (r"\bPydantic\b", "Pydantic"),

    # 모바일
    (r"\bFlutter\b", "Flutter"),
    (r"\bSwiftUI\b", "SwiftUI"),
    (r"\bJetpack\s*Compose\b", "Jetpack Compose"),
    (r"\bExpo\b", "Expo"),

    # 기타
    (r"\bLinux\b", "Linux"),
    (r"\bUbuntu\b", "Ubuntu"),
    (r"\bUnity\b", "Unity"),
    (r"\bOpenCV\b", "OpenCV"),
    (r"\bROS\b", "ROS"),
    (r"\bSelenium\b", "Selenium"),
    (r"\bPlaywright\b", "Playwright"),
    (r"\bPuppeteer\b", "Puppeteer"),
    (r"\bJest\b", "Jest"),
    (r"\bpytest\b", "pytest"),
    (r"\bCypress\b", "Cypress"),
]

# \b는 한국어 인접 문자에 약함 ("PyTorch로" → \b 매칭 실패).
# ASCII 영숫자/언더스코어만 word character로 간주하는 사용자 정의 경계로 교체.
_LATIN_WORD = r"[a-zA-Z0-9_]"


def _make_boundary(pattern: str) -> str:
    """패턴 양 끝의 \\b를 한국어 안전 boundary로 치환."""
    # \b\w+\b 형태가 아니어도 동작: 패턴 양쪽에 negative lookbehind/lookahead 부착
    if pattern.startswith(r"\b"):
        pattern = f"(?<!{_LATIN_WORD})" + pattern[2:]
    if pattern.endswith(r"\b"):
        pattern = pattern[:-2] + f"(?!{_LATIN_WORD})"
    return pattern


# 컴파일 (대소문자 무시 + 한국어 안전 경계)
_COMPILED: list[tuple[re.Pattern, str]] = [
    (re.compile(_make_boundary(p), re.IGNORECASE), label) for p, label in _TECH_PATTERNS
]


def extract_tech_stack(text: str, *, max_items: int = 30) -> list[str]:
    """텍스트에서 기술 키워드를 추출해 중복 제거된 리스트로 반환.

    매칭은 case-insensitive 하지만 반환 표기는 표준 표기를 사용한다.
    `max_items`로 상한 설정 (너무 많이 추출되면 노이즈).
    """
    if not text:
        return []

    found: dict[str, int] = {}  # label → 등장 횟수
    for pattern, label in _COMPILED:
        if pattern.search(text):
            found[label] = found.get(label, 0) + 1

    # 등장 횟수 기준 정렬 (많이 등장한 것 우선)
    sorted_labels = sorted(found.keys(), key=lambda k: -found[k])
    return sorted_labels[:max_items]


def merge_tech_stacks(*lists: list[str]) -> list[str]:
    """여러 tech_stack 리스트를 합치고 중복 제거 (대소문자 무시)."""
    seen: dict[str, str] = {}  # lower → original label
    for lst in lists:
        for tech in lst:
            if not tech:
                continue
            key = tech.lower()
            if key not in seen:
                seen[key] = tech
    return list(seen.values())
