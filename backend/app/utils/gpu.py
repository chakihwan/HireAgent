"""GPU VRAM 조회 + 모델 적합성 판정 (모델 다운로드/선택 전 사전 경고용).

핵심 설계:
- 하드코딩 금지 — 런타임에 실제 GPU VRAM을 조회하므로 어떤 하드웨어에서든 그 사양 기준 판정.
- graceful degradation — GPU 없거나 NVML 로드 실패 시 None 반환 → 경고 비활성화(모든 모델 허용).
- nvidia-ml-py(NVML)는 NVIDIA GPU만 지원. AMD/Apple/CPU 환경은 None.
"""
from __future__ import annotations

from dataclasses import dataclass

# 모델 파일 크기 대비 실제 VRAM 사용량 안전계수.
# 실측: gemma4:e4b 9.6GB 파일 → 로드 시 ~9.8GB VRAM (KV cache·context 오버헤드 포함).
_VRAM_SAFETY_FACTOR = 1.1
# 시스템/드라이버 예약분을 감안해 총량의 이 비율까지만 "안전"으로 간주.
_USABLE_RATIO = 0.92


@dataclass
class GpuInfo:
    name: str
    total_mb: int
    free_mb: int

    @property
    def total_gb(self) -> float:
        return round(self.total_mb / 1024, 1)

    @property
    def free_gb(self) -> float:
        return round(self.free_mb / 1024, 1)


def get_gpu_info() -> GpuInfo | None:
    """첫 번째 NVIDIA GPU의 VRAM 정보. GPU 없거나 NVML 실패 시 None."""
    try:
        import pynvml  # nvidia-ml-py
    except ImportError:
        return None

    try:
        pynvml.nvmlInit()
    except Exception:
        return None

    try:
        if pynvml.nvmlDeviceGetCount() < 1:
            return None
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        raw_name = pynvml.nvmlDeviceGetName(handle)
        name = raw_name.decode() if isinstance(raw_name, bytes) else raw_name
        return GpuInfo(
            name=name,
            total_mb=int(mem.total / 1024 / 1024),
            free_mb=int(mem.free / 1024 / 1024),
        )
    except Exception:
        return None
    finally:
        try:
            pynvml.nvmlShutdown()
        except Exception:
            pass


def assess_model_fit(model_size_bytes: int, gpu: GpuInfo | None) -> dict:
    """모델 크기 vs GPU VRAM 적합성 판정.

    Returns:
        {
          "fit": "ok" | "tight" | "over" | "unknown",
          "required_gb": float,    # 추정 VRAM 필요량
          "message": str | None,   # 경고 메시지 (ok/unknown이면 None)
        }
    """
    required_gb = round((model_size_bytes / 1024 / 1024 / 1024) * _VRAM_SAFETY_FACTOR, 1)

    if gpu is None:
        return {"fit": "unknown", "required_gb": required_gb, "message": None}

    usable_gb = round(gpu.total_gb * _USABLE_RATIO, 1)

    if required_gb > gpu.total_gb:
        return {
            "fit": "over",
            "required_gb": required_gb,
            "message": (
                f"이 모델은 약 {required_gb}GB VRAM이 필요한데 GPU 총량은 {gpu.total_gb}GB입니다. "
                f"실행 시 runner가 종료될 수 있습니다 ({gpu.name})."
            ),
        }
    if required_gb > usable_gb:
        return {
            "fit": "tight",
            "required_gb": required_gb,
            "message": (
                f"이 모델은 약 {required_gb}GB가 필요해 GPU 총량 {gpu.total_gb}GB에 빠듯합니다. "
                f"다른 모델이 로드돼 있으면 실패할 수 있습니다."
            ),
        }
    return {"fit": "ok", "required_gb": required_gb, "message": None}
