from app.agents.llm import get_llm
from langchain.schema import HumanMessage, SystemMessage


SYSTEM_PROMPT = """You are a world-class research agent. Given a task, you:
1. Analyze it deeply and identify what background knowledge is needed
2. Gather and structure the relevant facts, context, and constraints
3. Flag anything ambiguous that the Writer will need to make a judgment call on

Return a clear, structured research brief. Do not write the final answer -
that is the Writer agent's job."""


async def researcher_agent(state: dict, emit) -> dict:
    await emit({
        "type": "agent_event", "agent": "researcher", "event": "thinking",
        "content": f"Analyzing task: {state['task_description'][:120]}",
    })

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Research this task thoroughly:\n\n{state['task_description']}"),
    ]

    await emit({
        "type": "agent_event", "agent": "researcher", "event": "action",
        "content": "Gathering relevant context and background facts...",
    })

    response = await get_llm(0.3).ainvoke(messages)

    await emit({
        "type": "agent_event", "agent": "researcher", "event": "handoff",
        "content": "Research complete. Handing off to Writer.", "to": "writer",
    })

    return {**state, "research_output": response.content}
