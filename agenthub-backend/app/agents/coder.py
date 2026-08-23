from app.agents.llm import get_llm
from langchain.schema import HumanMessage, SystemMessage


SYSTEM_PROMPT = """You are a senior software engineer. Write clean,
production-ready code with comments, proper error handling, and a short
explanation of your architectural choices. If given prior critique, fix every
point raised."""


async def coder_agent(state: dict, emit) -> dict:
    revision = state.get("revision_count", 0)
    critique = state.get("critique_feedback", "")

    await emit({
        "type": "agent_event", "agent": "coder", "event": "thinking",
        "content": "Revising implementation based on critique..." if revision > 0 else "Analyzing requirements and designing the implementation...",
    })

    context_parts = [f"Coding task:\n{state['task_description']}"]
    if critique:
        context_parts.append(f"Critique to address (previous attempt scored {state.get('last_score', '?')}/100):\n{critique}")
    if revision > 0:
        context_parts.append(f"Previous code:\n{state.get('draft_output', '')}")

    messages = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content="\n\n".join(context_parts))]
    response = await get_llm(0.1).ainvoke(messages)

    await emit({
        "type": "agent_event", "agent": "coder", "event": "handoff",
        "content": "Implementation ready. Sending to Critic for review.", "to": "critic",
    })

    return {**state, "draft_output": response.content, "revision_count": revision + 1}
