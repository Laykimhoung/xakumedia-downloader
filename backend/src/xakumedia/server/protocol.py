"""JSON-RPC 2.0 protocol models and error codes for inter-process communication."""

from typing import Any

from pydantic import BaseModel, Field

# Standard JSON-RPC 2.0 error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
DOMAIN_ERROR = -32000


class JsonRpcRequest(BaseModel):
    """Incoming request from desktop shell (Electron) to Python engine."""

    jsonrpc: str = "2.0"
    id: str | int
    method: str
    params: dict[str, Any] = Field(default_factory=dict)


class JsonRpcError(BaseModel):
    """Structured error payload adhering to JSON-RPC 2.0."""

    code: int
    message: str
    data: Any | None = None


class JsonRpcResponse(BaseModel):
    """Outgoing response sent over stdout back to the desktop shell."""

    jsonrpc: str = "2.0"
    id: str | int | None = None
    result: Any | None = None
    error: JsonRpcError | None = None

    @classmethod
    def success(cls, req_id: str | int, result: Any) -> "JsonRpcResponse":
        return cls(id=req_id, result=result)

    @classmethod
    def fail(
        cls,
        req_id: str | int | None,
        code: int,
        message: str,
        data: Any | None = None,
    ) -> "JsonRpcResponse":
        return cls(id=req_id, error=JsonRpcError(code=code, message=message, data=data))


class JsonRpcNotification(BaseModel):
    """One-way event notification sent over stdout (e.g. progress updates)."""

    jsonrpc: str = "2.0"
    method: str
    params: dict[str, Any] = Field(default_factory=dict)
