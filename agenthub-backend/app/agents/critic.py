from app.agents.llm import get_llm
from langchain.schema import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

MAX_REVISIONS = 2


class CritiqueResult(BaseModel):
    """Structured verdict - this is what makes the evaluation a trust layer
    instead of a free-text opinion: every review produces a numeric score
    and an explicit approve/revise decision that the graph can branch on."""
    approved: bool = Field(description="True if the draft is ready to ship as-is")
    score: int = Field(ge=0, le=100, description="Overall quality score out of 100")
    feedback: str = Field(description="Specific, actionable feedback. If approved, briefly say why it passed.")


SYSTEM_PROMPT = """You are a ruthless but fair quality reviewer. Score the draft
on accuracy, completeness (does it fully address the task?), clarity, and
reasoning quality. Be specific in your feedback - vague praise or vague
criticism is not useful to the Writer agent that will read it."""


async def critic_agent(state: dict, emit) -> dict:
    await emit({
        "type": "agent_event", "agent": "critic", "event": "thinking",
        "content": "Evaluating the draft for accuracy, completeness, and clarity...",
    })

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Original task:\n{state['task_description']}\n\nDraft to review:\n{state.get('draft_output', '')}"),
    ]

    result: CritiqueResult = await get_llm(0.1).with_structured_output(CritiqueResult).ainvoke(messages)

    revision_count = state.get("revision_count", 0)
    # Force approval past the revision cap so the graph always terminates,
    # even if the model keeps finding nitpicks.
    approved = result.approved or revision_count >= MAX_REVISIONS

    await emit({
        "type": "agent_event", "agent": "critic", "event": "evaluation",
        "content": result.feedback,
        "metadata": {"approved": approved, "score": result.score, "revision_count": revision_count},
        "to": "complete" if approved else "writer",
    })

    return {
        **state,
        "critique_feedback": result.feedback,
        "last_score": result.score,
        "final_output": state.get("draft_output") if approved else None,
        "approved": approved,
    }
