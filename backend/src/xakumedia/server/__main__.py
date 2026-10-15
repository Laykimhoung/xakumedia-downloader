"""Main executable entrypoint for `python -m xakumedia.server`."""

import sys

from .loop import run_stdio_server

if __name__ == "__main__":
    sys.exit(run_stdio_server())
