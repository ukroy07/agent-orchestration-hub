from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional, Callable, Awaitable
from app.agents.researcher import researcher_agent
from app.agents.writer import writer_agent
from app.agents.critic import critic_agent
from app.agents.coder import coder_agent

Emit = Callable[[dict], Awaitable[None]]


class AgentState(TypedDict, total=False):
    task_id: str
    task_description: str
    task_type: str
    research_output: Optional[str]
    draft_output: Optional[str]
    critique_feedback: Optional[str]
    last_score: Optional[int]
    final_output: Optional[str]
    approved: bool
    revision_count: int
    human_instruction: Optional[str]


def _make_node(agent_fn, emit: Emit):
    """Wrap an (state, emit) -> state coroutine function as a proper `async def`
    closure. This matters: LangGraph decides whether to await a node's return
    value by checking `inspect.iscoroutinefunction` on the callable you register.
    A `lambda s: agent_fn(s, emit)` is a *sync* function that happens to return
    a coroutine object - LangGraph would treat that unawaited coroutine as the
    state update and silently break. Defining a real `async def` here is what
    makes LangGraph detect and await it correctly."""
    async def node(state: AgentState) -> AgentState:
        return await agent_fn(state, emit)
    return node


def should_revise(state: AgentState) -> str:
    if state.get("approved"):
        return "finalize"
    # Route the revision back to whichever agent produced the draft
    return "revise_coder" if state.get("task_type") == "code_review" else "revise_writer"


def route_by_type(state: AgentState) -> str:
    return "coder" if state.get("task_type") == "code_review" else "researcher"


async def run_workflow(task_id: str, description: str, task_type: str, emit: Emit) -> AgentState:
    """Build and run the multi-agent graph to completion. Every side effect
    (persistence, WebSocket push) happens inside `emit`, called by the agents -
    this function just returns the final state."""
    initial_state: AgentState = {
        "task_id": task_id,
        "task_description": description,
        "task_type": task_type,
        "revision_count": 0,
        "approved": False,
    }

    graph = StateGraph(AgentState)
    graph.add_node("researcher", _make_node(researcher_agent, emit))
    graph.add_node("writer", _make_node(writer_agent, emit))
    graph.add_node("critic", _make_node(critic_agent, emit))
    graph.add_node("coder", _make_node(coder_agent, emit))

    graph.set_conditional_entry_point(route_by_type, {"researcher": "researcher", "coder": "coder"})
    graph.add_edge("researcher", "writer")
    graph.add_edge("writer", "critic")
    graph.add_edge("coder", "critic")
    graph.add_conditional_edges(
        "critic", should_revise,
        {"revise_writer": "writer", "revise_coder": "coder", "finalize": END},
    )

    compiled = graph.compile()
    final_state = await compiled.ainvoke(initial_state)
    return final_state
