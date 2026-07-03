from fastapi import APIRouter

from app.schemas.ai import AITestRequest, AITestResponse
from app.services.llm_service import run_ai_test

router = APIRouter()


@router.post("/test", response_model=AITestResponse)
def test_ai(request: AITestRequest) -> AITestResponse:
    return run_ai_test(request)
