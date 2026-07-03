from app.schemas.ai import AITestRequest, AITestResponse


def run_ai_test(request: AITestRequest) -> AITestResponse:
    return AITestResponse(
        status="stub",
        message=(
            "AI execution is reserved for a later platform phase. "
            f"Received {len(request.prompt)} characters."
        ),
    )
