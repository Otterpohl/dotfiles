/**
 * Janus Permission Gate Extension
 *
 * Intercepts ALL tool calls (bash, read, write, edit, etc.) and checks
 * them against the janus permission tool at ~/dev/janus.
 *
 * Behavior:
 *   - janus says "allow" → tool executes normally
 *   - janus says "deny"  → tool is blocked with a reason
 *   - janus says "ask"   → blocked by default (safe default).
 *                          In TUI mode, prompts the user first.
 *
 * Install: place in ~/.pi/agent/extensions/ and restart or /reload
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const JANUS_BIN = "/home/otterpohl/dev/janus/target/release/janus";

export default function (pi: ExtensionAPI) {
  // Verify janus exists at startup
  if (!existsSync(JANUS_BIN)) {
    console.error(`[janus-gate] ERROR: janus binary not found at ${JANUS_BIN}`);
    console.error("[janus-gate] Build it: cd ~/dev/janus && cargo build --release");
    return;
  }

  pi.on("tool_call", async (event, ctx) => {
    // Serialize tool arguments as JSON for janus
    const argsJson = JSON.stringify(event.input);

    let stdout: string;
    try {
      stdout = execFileSync(JANUS_BIN, ["check", event.toolName, argsJson], {
        timeout: 5000,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      }).trim();
    } catch (err) {
      // janus failed or timed out — deny for safety
      ctx.ui.notify(`[janus] check failed for ${event.toolName}: ${err}`, "error");
      return {
        block: true,
        reason: `Blocked by janus gate: permission check error for ${event.toolName}`,
      };
    }

    switch (stdout) {
      case "allow":
        // Let it through
        return;

      case "deny":
      case "ask": {
        // Defer to user in TUI mode; block in headless mode
        if (ctx.hasUI) {
          const verb = stdout === "deny" ? "denied by a janus rule" : "unrecognized (no janus rule)";
          const choice = await ctx.ui.select(
            `⚠️  This ${event.toolName} command is ${verb}:\n\n  ${formatPreview(event.toolName, event.input)}\n\nWhat would you like to do?`,
            [
              "Deny it (default)",
              "Allow this once",
              "Allow and remember (add allow rule)",
            ],
          );

          if (choice === "Allow this once") {
            return;
          }
          if (choice === "Allow and remember (add allow rule)") {
            try {
              execFileSync(JANUS_BIN, ["remember", event.toolName, "^" + escapeRegex(argsJson), "allow"], {
                timeout: 3000,
                encoding: "utf8",
              });
              ctx.ui.notify(`[janus] Remembered: allow ${event.toolName}`, "info");
            } catch {
              // Non-fatal: the one-time approval still works
            }
            return;
          }
        }

        return {
          block: true,
          reason: `Blocked by janus: ${event.toolName} command ${stdout === "deny" ? "denied by rule" : "unrecognized"}`,
        };
      }

      default:
        // Unexpected output — deny for safety
        ctx.ui.notify(`[janus] Unexpected output: "${stdout}"`, "error");
        return {
          block: true,
          reason: `Blocked by janus gate: unexpected response from permission check`,
        };
    }
  });
}

/**
 * Format a readable one-liner preview of the tool call for the prompt.
 */
function formatPreview(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") {
    const cmd = (input.command as string) ?? JSON.stringify(input);
    const parts = cmd.split(/(?=&&|\|\||;|\|)/);
    if (parts.length <= 1) return cmd;
    return parts.map((p) => "  " + p.trim()).join("\n");
  }
  if (["read", "write", "edit"].includes(toolName)) {
    return (input.path as string) ?? (input.filePath as string) ?? JSON.stringify(input);
  }
  return JSON.stringify(input).slice(0, 200);
}

/**
 * Escape a string for use in a regex pattern.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
