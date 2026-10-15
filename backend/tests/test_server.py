"""Unit tests for the stdio JSON-RPC server, protocol models, and dispatcher."""

import io
import json
from unittest.mock import patch

from xakumedia import __version__
from xakumedia.exceptions.base import UnsupportedSourceError
from xakumedia.server.dispatcher import RpcDispatcher
from xakumedia.server.loop import run_stdio_server
from xakumedia.server.protocol import (
    DOMAIN_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    JsonRpcRequest,
    JsonRpcResponse,
)


def test_protocol_models() -> None:
    req = JsonRpcRequest(id="1", method="ping", params={"key": "val"})
    assert req.jsonrpc == "2.0"
    assert req.id == "1"
    assert req.method == "ping"

    res = JsonRpcResponse.success("1", {"status": "ok"})
    assert res.id == "1"
    assert res.result == {"status": "ok"}
    assert res.error is None

    err_res = JsonRpcResponse.fail("2", METHOD_NOT_FOUND, "Not found")
    assert err_res.id == "2"
    assert err_res.result is None
    assert err_res.error is not None
    assert err_res.error.code == METHOD_NOT_FOUND


def test_dispatcher_ping() -> None:
    dispatcher = RpcDispatcher()
    req = JsonRpcRequest(id="test-1", method="ping")
    res = dispatcher.dispatch(req)

    assert res.id == "test-1"
    assert res.error is None
    assert res.result["status"] == "ok"
    assert res.result["message"] == "pong"
    assert res.result["version"] == __version__


def test_dispatcher_system_info() -> None:
    dispatcher = RpcDispatcher()
    req = JsonRpcRequest(id="test-2", method="get_system_info")
    res = dispatcher.dispatch(req)

    assert res.id == "test-2"
    assert res.error is None
    assert res.result["engine_version"] == __version__
    assert "python_version" in res.result
    assert "platform" in res.result
    assert "data_dir" in res.result
    assert "download_dir" in res.result


def test_dispatcher_echo() -> None:
    dispatcher = RpcDispatcher()
    payload = {"data": [1, 2, 3], "flag": True}
    req = JsonRpcRequest(id="test-3", method="echo", params=payload)
    res = dispatcher.dispatch(req)

    assert res.id == "test-3"
    assert res.error is None
    assert res.result == payload


def test_dispatcher_method_not_found() -> None:
    dispatcher = RpcDispatcher()
    req = JsonRpcRequest(id="test-4", method="unknown_method")
    res = dispatcher.dispatch(req)

    assert res.id == "test-4"
    assert res.error is not None
    assert res.error.code == METHOD_NOT_FOUND


def test_dispatcher_domain_error() -> None:
    dispatcher = RpcDispatcher()

    def failing_handler(_params: dict) -> None:
        raise UnsupportedSourceError("Unsupported source: https://example.com/not-supported")

    dispatcher.register("fail", failing_handler)
    req = JsonRpcRequest(id="test-5", method="fail")
    res = dispatcher.dispatch(req)

    assert res.id == "test-5"
    assert res.error is not None
    assert res.error.code == DOMAIN_ERROR
    assert "Unsupported source" in res.error.message
    assert res.error.data["error"] == "UnsupportedSourceError"


def test_stdio_server_loop() -> None:
    # Simulate stdin with 3 messages: valid ping, invalid JSON, and invalid request format
    input_stream = io.StringIO(
        '{"id": 1, "method": "ping"}\n'
        "not-valid-json\n"
        '{"invalid": "format"}\n'
    )
    output_stream = io.StringIO()

    with patch("sys.stdin", input_stream), patch("sys.stdout", output_stream):
        exit_code = run_stdio_server()
        assert exit_code == 0

    output_lines = [line.strip() for line in output_stream.getvalue().splitlines() if line.strip()]
    assert len(output_lines) == 3

    # Response 1: Valid ping
    resp1 = json.loads(output_lines[0])
    assert resp1["id"] == 1
    assert resp1["result"]["status"] == "ok"

    # Response 2: Parse error
    resp2 = json.loads(output_lines[1])
    assert resp2["error"]["code"] == PARSE_ERROR

    # Response 3: Invalid request error
    resp3 = json.loads(output_lines[2])
    assert resp3["error"]["code"] == INVALID_REQUEST
