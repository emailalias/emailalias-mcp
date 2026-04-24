# @emailalias/mcp

MCP server for the [EmailAlias.io](https://emailalias.io) REST API. Lets you create, manage, and monitor email aliases from **Claude Desktop**, **Cursor**, **Zed**, **Cline**, and any other MCP-compatible AI assistant — in natural language.

> "Create a new alias for Substack, label it 'newsletter'"
> "Disable the amazon alias, I'm getting spam"
> "Show me aliases flagged for suspicious senders this week"

API access is a **Premium** feature. Generate an API key from **Settings → API Keys** in the dashboard.

## Install

### Claude Desktop

Edit your config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add the `emailalias` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "emailalias": {
      "command": "npx",
      "args": ["-y", "@emailalias/mcp"],
      "env": {
        "EMAILALIAS_API_KEY": "ea_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. You should see a 🔌 plug icon confirming the server is connected.

### Cursor, Zed, Cline, and other MCP clients

Every MCP-compatible client accepts the same shape. Consult your client's docs for the exact config path, then use:

```
command: npx
args: -y @emailalias/mcp
env: EMAILALIAS_API_KEY=ea_live_...
```

### Global install (optional)

If you don't want `npx` to download the package on each launch:

```bash
npm install -g @emailalias/mcp
```

Then change `command` to `emailalias-mcp` and drop the `-y @emailalias/mcp` args.

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `EMAILALIAS_API_KEY` | ✅ | — | Premium-only. Starts with `ea_live_`. |
| `EMAILALIAS_BASE_URL` | ❌ | `https://emailalias.io` | Override for staging/self-host. |

## Available tools

| Tool | What it does |
|---|---|
| `list_aliases` | All aliases with forwarded/blocked counts |
| `create_alias` | Create a random / custom / tagged alias |
| `update_alias` | Toggle active, rename label |
| `delete_alias` | Permanently delete an alias |
| `list_available_domains` | System + custom domains available |
| `list_destinations` | Primary + verified forwarding inboxes |
| `add_destination` | Register a new forwarding destination (triggers verify email) |
| `delete_destination` | Remove a destination (blocks if aliases still use it) |
| `send_email` | Send from an alias (Premium) |
| `get_dashboard_stats` | Account-wide counters |
| `list_email_logs` | Paginated forwarding log (last 90 days) |
| `list_exposure_events` | Suspicious-sender alerts |

## Example prompts (Claude Desktop)

```
Create a disposable alias for signing up to Substack. Label it "newsletter".
```

```
Show me all aliases that have received zero emails in 30 days.
```

```
Disable every alias labelled "shopping" and list what you disabled.
```

```
What's my exposure alert count for this month?
```

## Development

```bash
git clone https://github.com/emailalias/emailalias-mcp.git
cd emailalias-mcp
npm install
npm run build

# Test against the MCP Inspector (installs on demand)
npx @modelcontextprotocol/inspector node dist/index.js
```

`EMAILALIAS_API_KEY` must be set in your shell for manual runs.

## Security notes

- **Your API key stays on your machine.** This server runs locally (stdio transport), invokes the EmailAlias API over HTTPS, and sends the key directly. No third party sees it.
- **Don't commit `claude_desktop_config.json`** — it contains your key. Treat it like `.env`.
- **Scope matters.** Any MCP tool your LLM decides to call executes against your live account. Review what the model proposes before approving destructive actions like `delete_alias`.

## Links

- API docs: <https://emailalias.io/documentation>
- EmailAlias.io: <https://emailalias.io>
- Model Context Protocol: <https://modelcontextprotocol.io>

## License

MIT
