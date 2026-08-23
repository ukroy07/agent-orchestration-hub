"""One place that decides which chat model the agents talk to.

Two reasons this is a factory rather than a module-level `llm = Chat...()`
in each agent file:

1. **Provider choice belongs in config, not in four separate files.** Set
   `GOOGLE_API_KEY` (Gemini) or `OPENAI_API_KEY` in `.env` and every agent
   follows; `LLM_PROVIDER` forces one explicitly when both are present.
2. **Construction must be lazy.** `app.main` imports routes -> services ->
   orchestrator -> agents at startup, so a chat model built at agent-module
   import time would make a missing/invalid API key an *import* failure -
   the whole app fails to boot, health check included. Building it on first
   use instead turns that into a normal task failure, which the workflow
   already catches, writes to `agent_logs`, and streams to the UI.
"""

from functools import lru_cache
from typing import Any

from loguru import logger

from app.config import settings

# Pinned model names, not moving aliases like "gemini-flash-latest" - an
# alias that silently re-points can change agent behaviour (and the Critic's
# scoring in particular) with no code change to explain it. Bump these
# deliberately: Google retires older Gemini models for new API keys, which
# is what took `gemini-2.5-flash` out (404 "no longer available to new
# users"). `LLM_MODEL` in .env overrides without touching this file.
#
# The Google default is a *lite* model on purpose. Free-tier quota is per
# model per day, and one AgentHub task costs 3-6 calls (researcher, writer,
# critic, plus a revision round) - on `gemini-3.7-flash`, whose free tier
# allows 20 requests/day, that is roughly four tasks before every run fails
# with a 429. The lite tier is far more generous and still scores sensibly
# against the Critic's rubric. Set LLM_MODEL=gemini-3.6-flash (or
# gemini-3.7-flash) when you want the stronger model and can live with the
# quota.
DEFAULT_MODELS = {
    "google": "gemini-3.5-flash-lite",
    "openai": "gpt-4o",
}


@lru_cache(maxsize=None)
def get_llm(temperature: float = 0.3) -> Any:
    """Return the configured chat model, one cached instance per temperature.

    Agents differ only in temperature (researcher 0.3, writer 0.7, critic and
    coder 0.1), so caching on it gives each agent its own client without
    rebuilding one per invocation.
    """
    provider = settings.llm_provider_resolved
    model = settings.LLM_MODEL or DEFAULT_MODELS.get(provider, "")

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        # lru_cache means this logs once per temperature, not once per call.
        logger.bind(agent="system").debug("building google model {} (temp {})", model, temperature)
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=temperature,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        logger.bind(agent="system").debug("building openai model {} (temp {})", model, temperature)
        return ChatOpenAI(
            model=model,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
        )

    raise RuntimeError(
        "No LLM configured. Set GOOGLE_API_KEY (Gemini) or OPENAI_API_KEY in "
        "agenthub-backend/.env, then restart the server."
    )
