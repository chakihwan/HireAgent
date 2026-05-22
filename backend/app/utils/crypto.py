"""API 키 암호화/복호화 유틸리티.

CLAUDE.md 절대 규칙 #2: 사용자 API 키는 AES-256(Fernet) 암호화 후 DB 저장.
- 환경변수 `ENCRYPTION_KEY` 필수 (`cryptography.fernet.Fernet.generate_key()` 으로 생성)
- 메모리에서 사용 직후 즉시 제거 (호출자 책임)
- 로그/응답/git 커밋에 키 노출 금지
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _get_cipher() -> Fernet:
    key = settings.encryption_key
    if not key or key == "change-me-in-production":
        raise RuntimeError(
            "ENCRYPTION_KEY가 설정되지 않았습니다. "
            "다음 명령으로 생성 후 .env에 저장하세요: "
            "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_api_key(plaintext: str) -> str:
    """평문 API 키를 암호화해서 DB 저장용 문자열로 반환."""
    if not plaintext:
        raise ValueError("암호화할 키가 비어 있습니다")
    token = _get_cipher().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_api_key(ciphertext: str) -> str:
    """DB에 저장된 암호화 문자열을 평문 API 키로 복호화.

    호출자는 사용 직후 변수를 메모리에서 제거해야 한다 (예: `del api_key`).
    """
    if not ciphertext:
        raise ValueError("복호화할 토큰이 비어 있습니다")
    try:
        plaintext = _get_cipher().decrypt(ciphertext.encode("utf-8"))
    except InvalidToken as e:
        raise ValueError("암호화 토큰이 유효하지 않습니다 (키가 바뀌었거나 데이터가 변조됨)") from e
    return plaintext.decode("utf-8")


def mask_key(key: str, visible_prefix: int = 6, visible_suffix: int = 4) -> str:
    """로그/UI 표시용 마스킹. 예: 'sk-ant-1234567890' → 'sk-ant***7890'.

    절대 평문을 로그에 남기지 말 것. 디버그 시에만 마스킹된 형태로 표시.
    """
    if not key:
        return ""
    if len(key) <= visible_prefix + visible_suffix:
        return "*" * len(key)
    return f"{key[:visible_prefix]}***{key[-visible_suffix:]}"
