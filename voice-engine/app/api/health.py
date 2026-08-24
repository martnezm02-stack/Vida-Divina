from fastapi import APIRouter

from ..config import DEVICE
from ..models.registry import is_loaded

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": is_loaded(),
        "device": DEVICE,
    }
