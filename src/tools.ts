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
    "Create a new email alias. 'random' generates a short code; 'custom' uses custom_code; 'tagged' prepends a random code to a user-provided tag. destination_email must be the user's primary email OR a verified forwarding destination. display_name is Premium-only and shown as the sender on outbound mail.",
    {
      alias_type: z.enum(["random", "custom", "tagged"]).default("random"),
      label: z.string().optional().describe("Human-friendly label, e.g. 'Shopping'"),
      domain: z.string().optional().describe("Alias domain (defaults to the account's default)"),
      destination_email: z.string().email().optional(),
      custom_code: z.string().optional().describe("Required when alias_type='custom'"),
      tag: z.string().optional().describe("Required when alias_type='tagged'"),
      display_name: z.string().max(32).optional().describe("Premium-only sender label shown on outbound mail (e.g. 'Sam Carter'). Set on creation activates immediately."),
    },
    async (args) => safeCall(() => client.createAlias(args)),
  );

  server.tool(
    "update_alias",
    "Update an alias: toggle active (enable/disable) or rename its label. To change the sender display name, use update_alias_display_name (separate 24h-cooldown endpoint).",
    {
      alias_id: z.string().uuid(),
      active: z.boolean().optional(),
      label: z.string().optional(),
    },
    async ({ alias_id, ...patch }) => safeCall(() => client.updateAlias(alias_id, patch)),
  );

  server.tool(
    "update_alias_display_name",
    "Schedule a display-name change on an alias (Premium-only). Edits do NOT take effect immediately — the new value lands in display_name_pending and promotes 24h after the most recent edit. Editing again resets the clock. Capped at 3 edits per rolling 24h per alias. Pass display_name=null (or empty string) to clear; clearing follows the same cooldown. Brand-impersonation patterns (PayPal, Apple, banks, etc.) are rejected with 400.",
    {
      alias_id: z.string().uuid(),
      display_name: z.string().max(32).nullable().describe("New display name, or null to clear. Max 32 characters."),
    },
    async ({ alias_id, display_name }) =>
      safeCall(() => client.updateAliasDisplayName(alias_id, display_name)),
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

  // ── Custom domains ─────────────────────────────────────────────────────────
  server.tool(
    "list_domains",
    "List the user's custom domains with full detail: id, domain_name, verified, the SPF/DKIM/DMARC/MX/mail-from check flags, catch_all + catch_all_destination, alias_count, and auto_created_alias_count. Use this to get a domain's id before setting catch-all or disabling its auto-created aliases.",
    {},
    async () => safeCall(() => client.listDomains()),
  );

  server.tool(
    "add_domain",
    "Register a custom domain on the account. Returns the domain record including required_dns_records — the TXT/MX/SPF/DKIM/DMARC records the user must publish at their registrar before the domain can be verified. Does NOT verify it; call verify_domain after the DNS records propagate.",
    { domain_name: z.string().describe("The domain to add, e.g. 'example.com'.") },
    async ({ domain_name }) => safeCall(() => client.addDomain(domain_name)),
  );

  server.tool(
    "verify_domain",
    "Re-check a custom domain's DNS and mark it verified once TXT, MX, SPF, DKIM, and DMARC all pass. Returns the updated verification flags. Run after adding the DNS records from add_domain (records can take minutes to hours to propagate).",
    { domain_id: z.string().uuid() },
    async ({ domain_id }) => safeCall(() => client.verifyDomain(domain_id)),
  );

  server.tool(
    "delete_domain",
    "Permanently remove a custom domain. This also deletes every alias on that domain and cannot be undone. Prefer disabling individual aliases if the user might want them back.",
    { domain_id: z.string().uuid() },
    async ({ domain_id }) => safeCall(() => client.deleteDomain(domain_id).then(() => "deleted")),
  );

  server.tool(
    "set_catch_all",
    "Enable or disable catch-all on a verified custom domain (Premium-only). With catch-all on, any address at the domain auto-creates an alias on its first inbound email — handy for giving out addresses on the fly. When enabling, destination must be the user's primary email or a verified forwarding destination (defaults to the primary email if omitted); that inbox receives every auto-created alias. Disabling clears the destination but leaves already-created aliases forwarding — use disable_catch_all_aliases to turn those off.",
    {
      domain_id: z.string().uuid(),
      catch_all: z.boolean(),
      destination: z.string().email().optional().describe("Required-ish when enabling: the inbox to forward catch-all mail to. Defaults to the account's primary email."),
    },
    async ({ domain_id, catch_all, destination }) =>
      safeCall(() => client.setCatchAll(domain_id, catch_all, destination)),
  );

  server.tool(
    "disable_catch_all_aliases",
    "Bulk-disable every active alias that catch-all auto-created on a domain. Sets them inactive (forwarding stops) without deleting them, and leaves hand-created aliases and the catch-all setting itself untouched. Idempotent — returns { disabled: <count> }. Use after turning catch-all off, or to stop a flood of auto-created aliases.",
    { domain_id: z.string().uuid() },
    async ({ domain_id }) => safeCall(() => client.disableCatchAllAliases(domain_id)),
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

  server.tool(
    "resend_destination_verification",
    "Send a fresh verification email to a pending (unverified) forwarding destination. Use when the original link expired or was lost.",
    { destination_id: z.string().uuid() },
    async ({ destination_id }) =>
      safeCall(() => client.resendDestinationVerification(destination_id)),
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
