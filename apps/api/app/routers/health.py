from fastapi import APIRouter

from app.core.logging import SERVICE_NAME

router = APIRouter()


@router.get("")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": SERVICE_NAME}
