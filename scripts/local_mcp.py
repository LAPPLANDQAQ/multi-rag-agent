"""Launch the repository's MCP servers on loopback for this local deployment."""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SERVERS = {
    "system": ("system_server", 8005),
    "websearch": ("websearch_server", 8006),
    "winlog": ("winlog_server", 8008),
    "network": ("network_server", 8009),
    "docker": ("docker_server", 8011),
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server", choices=SERVERS)
    args = parser.parse_args()
    module_name, port = SERVERS[args.server]
    module = importlib.import_module(f"mcp_servers.{module_name}")
    module.mcp.run(transport="streamable-http", host="127.0.0.1", port=port)
