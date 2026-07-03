from pydantic import BaseModel, Field


class AITestRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class AITestResponse(BaseModel):
    status: str
    message: str
