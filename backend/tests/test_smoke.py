"""Smoke test to verify environment and package imports."""

import xakumedia


def test_package_version() -> None:
    assert xakumedia.__version__ == "0.1.0"
