/**
 * MCP tool registrations for the EmailAlias.io API.
 *
 * Each tool is a thin wrapper over the `emailalias` Node client. LLM-facing
 * descriptions are short and action-oriented — the LLM decides when to invoke
 * based on these, so precision matters more than prose.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "emailalias";
import { z } from "zod";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(value: unknown): ToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function safeCall<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const result = await fn();
    return ok(result ?? "OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`EmailAlias API error: ${msg}`);
  }
}

export function registerTools(server: McpServer, client: Client) {
  // ── Aliases ────────────────────────────────────────────────────────────────
  server.tool(
    "list_aliases",
    "List all email aliases on the authenticated EmailAlias account. Returns id, alias_email, destination_email, active, label, emails_forwarded, emails_blocked.",
    {},
    async () => safeCall(() => client.listAliases()),
  );

  server.tool(
    "create_alias",
    "Create a new email alias. 'random' generates a short code; 'custom' uses custom_code; 'tagged' prepends a random code to a user-provided tag. destination_email must be the user's primary email OR a verified forwarding destination.",
    {
      alias_type: z.enum(["random", "custom", "tagged"]).default("random"),
      label: z.string().optional().describe("Human-friendly label, e.g. 'Shopping'"),
      domain: z.string().optional().describe("Alias domain (defaults to the account's default)"),
      destination_email: z.string().email().optional(),
      custom_code: z.string().optional().describe("Required when alias_type='custom'"),
      tag: z.string().optional().describe("Required when alias_type='tagged'"),
    },
    async (args) => safeCall(() => client.createAlias(args)),
  );

  server.tool(
    "update_alias",
    "Update an alias: toggle active (enable/disable) or rename its label.",
    {
      alias_id: z.string().uuid(),
      active: z.boolean().optional(),
      label: z.string().optional(),
    },
    async ({ alias_id, ...patch }) => safeCall(() => client.updateAlias(alias_id, patch)),
  );

  server.tool(
    "delete_alias",
    "Permanently delete an alias. This cannot be undone. Prefer update_alias with active=false if the user might want it back.",
    { alias_id: z.string().uuid() },
    async ({ alias_id }) => safeCall(() => client.deleteAlias(alias_id).then(() => "deleted")),
  );

  server.tool(
    "list_available_domains",
    "List domains the user can create aliases on (system domains + their verified custom domains).",
    {},
    async () => safeCall(() => client.listAvailableDomains()),
  );

  // ── Forwarding destinations ───────────────────────────────────────────────
  server.tool(
    "list_destinations",
    "List the user's forwarding destinations (primary email plus verified extras). is_primary=true marks the account email.",
    {},
    async () => safeCall(() => client.listDestinations()),
  );

  server.tool(
    "add_destination",
    "Add a new forwarding destination. Triggers a verification email to that address; the destination is unusable until the recipient clicks the link. Premium feature.",
    { email: z.string().email() },
    async ({ email }) => safeCall(() => client.addDestination(email)),
  );

  server.tool(
    "delete_destination",
    "Remove a forwarding destination. Fails with 409 if any alias still forwards to it — reassign those aliases first.",
    { destination_id: z.string().uuid() },
    async ({ destination_id }) =>
      safeCall(() => client.deleteDestination(destination_id).then(() => "removed")),
  );

  // ── Send email ────────────────────────────────────────────────────────────
  server.tool(
    "send_email",
    "Send an email from one of the user's aliases. The recipient sees only the alias address. Requires Premium and a verified, active alias.",
    {
      alias_id: z.string().uuid(),
      to_email: z.string().email(),
      subject: z.string(),
      body: z.string(),
      html_body: z.string().optional(),
    },
    async (args) => safeCall(() => client.sendEmail(args)),
  );

  // ── Analytics ─────────────────────────────────────────────────────────────
  server.tool(
    "get_dashboard_stats",
    "Account-wide counters: total aliases, active aliases, emails forwarded, emails blocked, exposure alerts.",
    {},
    async () => safeCall(() => client.getDashboardStats()),
  );

  server.tool(
    "list_email_logs",
    "Paginated email-forwarding log covering the last 90 days. Each item has sender, subject, direction, status, block_reason.",
    {
      page: z.number().int().positive().default(1),
      per_page: z.number().int().min(1).max(100).default(25),
    },
    async ({ page, per_page }) => safeCall(() => client.listLogs(page, per_page)),
  );

  server.tool(
    "list_exposure_events",
    "Suspicious-sender alerts scored against the user's aliases. Use this to identify risky senders and decide which aliases to disable.",
    {
      page: z.number().int().positive().default(1),
      per_page: z.number().int().min(1).max(100).default(25),
    },
    async ({ page, per_page }) => safeCall(() => client.listExposureEvents(page, per_page)),
  );
}
