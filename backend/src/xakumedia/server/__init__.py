"""JSON-RPC server subsystem for XakuMedia."""

from .dispatcher import RpcDispatcher
from .loop import run_stdio_server, send_notification, send_response
from .protocol import (
    DOMAIN_ERROR,
    INTERNAL_ERROR,
    INVALID_PARAMS,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    JsonRpcError,
    JsonRpcNotification,
    JsonRpcRequest,
    JsonRpcResponse,
)

__all__ = [
    "RpcDispatcher",
    "run_stdio_server",
    "send_notification",
    "send_response",
    "JsonRpcRequest",
    "JsonRpcResponse",
    "JsonRpcNotification",
    "JsonRpcError",
    "PARSE_ERROR",
    "INVALID_REQUEST",
    "METHOD_NOT_FOUND",
    "INVALID_PARAMS",
    "INTERNAL_ERROR",
    "DOMAIN_ERROR",
]
