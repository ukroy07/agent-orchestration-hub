import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    id: Optional[uuid.UUID] = None  # optional: let the client generate the ID upfront
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    task_type: str = "general"  # general | research | code_review


class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    status: str
    task_type: str
    result: Optional[str] = None
    result_metadata: Optional[dict] = None
    quality_score: Optional[float] = None
    revision_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentLogOut(BaseModel):
    id: uuid.UUID
    agent_name: str
    event_type: str
    content: str
    event_metadata: Optional[dict] = None
    sequence: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentOverride(BaseModel):
    instruction: str = Field(min_length=1)
    target_agent: Optional[str] = None
