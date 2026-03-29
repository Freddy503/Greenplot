#!/usr/bin/env python3
"""
MCP Design Server for Stitch assets.
Run: python -m mcp_design_server
"""

import json, os
from mcp import MCPServer, Resource, Tool
from mcp.types import TextContent

# Load design system from local directory (exported from Stitch)
DESIGN_DIR = os.path.join(os.path.dirname(__file__), "stitch_designs")

server = MCPServer("stitch-designs")

@server.resource("stitch://tokens")
def get_design_tokens() -> Resource:
    """Return design tokens (colors, typography, spacing) as JSON."""
    tokens_path = os.path.join(DESIGN_DIR, "tokens.json")
    if os.path.exists(tokens_path):
        with open(tokens_path) as f:
            data = json.load(f)
        return Resource(uri="stitch://tokens", text=json.dumps(data, indent=2))
    return Resource(uri="stitch://tokens", text="{}")

@server.resource("stitch://components/{name}")
def get_component_spec(name: str) -> Resource:
    """Return component specification by name (e.g., 'Button', 'Card')."""
    comp_path = os.path.join(DESIGN_DIR, "components", f"{name}.json")
    if os.path.exists(comp_path):
        with open(comp_path) as f:
            data = json.load(f)
        return Resource(uri=f"stitch://components/{name}", text=json.dumps(data, indent=2))
    return Resource(uri=f"stitch://components/{name}", text="{}")

@server.tool("stitch.get_guidelines")
def get_guidelines() -> list[TextContent]:
    """Return design guidelines and UX principles."""
    guide_path = os.path.join(DESIGN_DIR, "guidelines.md")
    if os.path.exists(guide_path):
        with open(guide_path) as f:
            text = f.read()
        return [TextContent(type="text", text=text)]
    return [TextContent(type="text", text="No guidelines found.")]

@server.tool("stitch.list_components")
def list_components() -> list[TextContent]:
    """List available component names."""
    comp_dir = os.path.join(DESIGN_DIR, "components")
    if os.path.exists(comp_dir):
        names = [f[:-5] for f in os.listdir(comp_dir) if f.endswith(".json")]
        return [TextContent(type="text", text="\n".join(names))]
    return [TextContent(type="text", text="No components found.")]

if __name__ == "__main__":
    server.run()
