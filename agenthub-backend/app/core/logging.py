"""Terminal logging: one colorized stream for everything the server does.

Two jobs here.

1. **Colour by agent.** A running workflow interleaves four agents plus the
   system, and a wall of same-coloured text makes it genuinely hard to see
   who did what. Every log line carries an `agent` field (bind it with
   `log = logger.bind(agent="critic")`), and the sink colours that column
   per agent using the same palette as the frontend's flow canvas, so the
   terminal and the browser agree on which colour means which agent.

2. **One stream, not three.** uvicorn, SQLAlchemy and the app each log
   through the stdlib `logging` module with their own formatting. The
   `InterceptHandler` below re-routes all of them into loguru so the
   terminal has a single consistent format instead of three competing ones.

Colour is applied by the *format string*, never by markup inside the
message. That matters: log content includes LLM output and task
descriptions, and a stray `<` in that text would otherwise be parsed as a
malformed colour tag and raise at log time.
"""

import logging
import sys
import warnings

from loguru import logger

# Same colour assignments as the frontend's `agent.*` Tailwind tokens.
AGENT_COLORS = {
    "researcher": "cyan",
    "writer": "yellow",
    "critic": "red",
    "coder": "magenta",
    "human": "green",
    "system": "white",
}
DEFAULT_AGENT_COLOR = "blue"


def _formatter(record) -> str:
    """Per-record format string. A callable (rather than a static format)
    is what lets the agent column change colour line by line."""
    agent = record["extra"].setdefault("agent", "app")
    color = AGENT_COLORS.get(agent, DEFAULT_AGENT_COLOR)
    return (
        "<green>{time:HH:mm:ss.SSS}</green> "
        "<dim>|</dim> <level>{level: <7}</level> "
        "<dim>|</dim> " + f"<{color}><b>{{extra[agent]: <10}}</b></{color}> "
        "<dim>|</dim> <level>{message}</level>\n"
    )


class InterceptHandler(logging.Handler):
    """Forwards a stdlib LogRecord into loguru, preserving level and origin."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Walk out of the logging machinery so the reported source file is
        # the caller's, not logging/__init__.py.
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        name = record.name.split(".")[0]
        logger.bind(agent=name).opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging(level: str = "INFO", sql_echo: bool = False) -> None:
    """Install the colorized sink and route stdlib logging through it.

    Call once, before the app is created.
    """
    logger.remove()  # drop loguru's default stderr handler
    logger.add(
        sys.stderr,
        level=level.upper(),
        format=_formatter,
        colorize=True,
        backtrace=True,
        # diagnose=False: tracebacks otherwise include local variable values,
        # which here would print API keys and password hashes to the terminal.
        diagnose=False,
        enqueue=False,
    )

    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # `warnings.warn` writes straight to stderr, bypassing logging entirely -
    # a multi-line DeprecationWarning landing mid-workflow shreds the format.
    # Route them through logging (and therefore loguru) so they arrive as one
    # formatted line like everything else.
    logging.captureWarnings(True)

    # langchain-google-genai 2.0.7 imports the retired `google.generativeai`
    # package and warns about it on every first agent call. There is nothing
    # to act on from here - it's fixed by upgrading that library, not by
    # changing our code - so silence this one rather than print a 10-line
    # notice per server start. Every other warning still comes through.
    warnings.filterwarnings("ignore", category=FutureWarning, module=r"langchain_google_genai")

    for name in (
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "fastapi",
        "sqlalchemy.engine",
        "httpx",
        "authlib",
        "py.warnings",
    ):
        std = logging.getLogger(name)
        std.handlers = [InterceptHandler()]
        std.propagate = False

    # SQLAlchemy's echo is a firehose - one multi-line block per statement.
    # Keep it out of the way unless explicitly asked for.
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if sql_echo else logging.WARNING
    )
