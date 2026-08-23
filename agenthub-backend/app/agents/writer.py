from app.agents.llm import get_llm
from langchain.schema import HumanMessage, SystemMessage


SYSTEM_PROMPT = """You are an expert writer. Transform research findings into a
clear, well-structured, high-quality response to the original task. If you are
given prior critique, you MUST address every point raised - do not repeat the
same mistakes."""


async def writer_agent(state: dict, emit) -> dict:
    revision = state.get("revision_count", 0)
    critique = state.get("critique_feedback", "")

    await emit({
        "type": "agent_event", "agent": "writer", "event": "thinking",
        "content": "Revising draft based on critique..." if revision > 0 else "Drafting initial response...",
    })

    context_parts = [f"Original task:\n{state['task_description']}", f"Research findings:\n{state.get('research_output', '')}"]
    if critique:
        context_parts.append(f"Critique to address (previous attempt scored {state.get('last_score', '?')}/100):\n{critique}")
    if revision > 0:
        context_parts.append(f"Previous draft:\n{state.get('draft_output', '')}")

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content="\n\n".join(context_parts) + "\n\nWrite the best possible response now."),
    ]

    response = await get_llm(0.7).ainvoke(messages)

    await emit({
        "type": "agent_event", "agent": "writer", "event": "handoff",
        "content": "Draft ready. Sending to Critic for evaluation.", "to": "critic",
    })

    return {**state, "draft_output": response.content, "revision_count": revision + 1}
