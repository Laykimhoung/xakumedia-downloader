"""Line-delimited JSON-RPC loop over standard I/O."""

import json
import sys

from pydantic import ValidationError

from ..core.logging import get_logger, setup_logging
from .dispatcher import RpcDispatcher
from .protocol import (
    INVALID_REQUEST,
    PARSE_ERROR,
    JsonRpcNotification,
    JsonRpcRequest,
    JsonRpcResponse,
)

logger = get_logger("server.loop")


def send_response(response: JsonRpcResponse) -> None:
    """Serialize and write a response line to stdout, then immediately flush."""
    line = response.model_dump_json()
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def send_notification(notification: JsonRpcNotification) -> None:
    """Serialize and write a one-way notification line to stdout, then flush."""
    line = notification.model_dump_json()
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def run_stdio_server(dispatcher: RpcDispatcher | None = None) -> int:
    """Run the synchronous stdio JSON-RPC request-response loop until stdin closes."""
    # Ensure UTF-8 I/O encoding on Windows
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    setup_logging()
    logger.info("XakuMedia Python stdio JSON-RPC server started.")

    active_dispatcher = dispatcher or RpcDispatcher()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # EOF: Parent Electron process closed stdin or terminated
                logger.info("Stdin EOF encountered. Shutting down Python engine.")
                break

            stripped = line.strip()
            if not stripped:
                continue

            try:
                raw_json = json.loads(stripped)
            except json.JSONDecodeError as exc:
                logger.warning(f"Failed to parse JSON payload: {exc}")
                send_response(
                    JsonRpcResponse.fail(None, PARSE_ERROR, f"Invalid JSON payload: {exc}")
                )
                continue

            try:
                request = JsonRpcRequest.model_validate(raw_json)
            except ValidationError as exc:
                req_id = raw_json.get("id") if isinstance(raw_json, dict) else None
                logger.warning(f"Invalid JSON-RPC request structure: {exc}")
                send_response(
                    JsonRpcResponse.fail(
                        req_id,
                        INVALID_REQUEST,
                        "Invalid JSON-RPC request structure",
                        data=exc.errors(include_url=False),
                    )
                )
                continue

            response = active_dispatcher.dispatch(request)
            send_response(response)

        except KeyboardInterrupt:
            logger.info("KeyboardInterrupt received. Exiting server loop.")
            break
        except Exception as exc:
            logger.critical(f"Unexpected fatal error in stdio server loop: {exc}", exc_info=True)
            break

    logger.info("XakuMedia Python engine exited cleanly.")
    return 0
