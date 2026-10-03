/**
 * Janus Permission Gate Extension
 *
 * Intercepts tool calls and checks them against the janus permission tool.
 *
 * Behavior:
 *   - janus says "allow" → tool executes normally
 *   - janus says "deny"  → tool is blocked with a reason
 *   - janus says "ask"   → blocked by default (safe default).
 *                          In TUI mode, prompts the user first.
 *
 * Install:
 *   cargo build --release
 *   janus install              # global install to ~/.pi/agent/extensions/
 *   janus install --local      # project-local install to ./.pi/extensions/
 *
 * Then restart pi or run /reload.
 *
 * Configuration:
 *   - Set JANUS_BIN env var to override the binary path.
 *   - Set JANUS_TIMEOUT_MS to override the default 5s check timeout.
 */

import {
  DynamicBorder,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const JANUS_TIMEOUT_MS = Number(process.env.JANUS_TIMEOUT_MS ?? "5000");

// Track tool calls that the user explicitly approved, so we can annotate the result.
const userApprovedToolCalls = new Set<string>();

function resolveJanusBin(): string | undefined {
  if (process.env.JANUS_BIN && existsSync(process.env.JANUS_BIN)) {
    return process.env.JANUS_BIN;
  }
  return findOnPath("janus");
}

function findOnPath(name: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const ext = process.platform === "win32" ? ".exe" : "";
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const candidate = join(dir, name + ext);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const bin = resolveJanusBin();
    if (!bin) {
      console.error("[janus-gate] janus binary not found on PATH");
      console.error("[janus-gate] Set JANUS_BIN or install janus to a directory on PATH");
      return {
        block: true,
        reason: "Blocked by janus gate: janus binary not found",
      };
    }

    const argsJson = JSON.stringify(event.input);

    let verdict: string;
    try {
      const { stdout } = await execFileAsync(bin, ["check", event.toolName, argsJson], {
        timeout: JANUS_TIMEOUT_MS,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      });
      verdict = stdout.trim().split("\n")[0].trim();
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
      const message = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(
        `[janus] check failed for ${event.toolName}: ${message}${stderr ? `\n${stderr}` : ""}`,
        "error",
      );
      return {
        block: true,
        reason: `Blocked by janus gate: permission check error for ${event.toolName}`,
      };
    }

    if (verdict === "allow") {
      return;
    }

    if (verdict === "deny" || verdict === "ask") {
      if (ctx.hasUI) {
        const choice = await showJanusDialog(ctx, bin, event.toolName, argsJson, verdict);

        if (choice === "allow") {
          userApprovedToolCalls.add(event.toolCallId);
          return;
        }
      }

      return {
        block: true,
        reason: `Blocked by janus: ${event.toolName} command ${verdict === "deny" ? "denied by rule" : "not covered by any rule"}`,
      };
    }

    ctx.ui.notify(`[janus] Unexpected output: "${verdict}"`, "error");
    return {
      block: true,
      reason: "Blocked by janus gate: unexpected response from permission check",
    };
  });

  pi.on("tool_result", async (event) => {
    if (!userApprovedToolCalls.has(event.toolCallId)) {
      return;
    }
    userApprovedToolCalls.delete(event.toolCallId);

    const note = "[USER APPROVED THIS TOOL CALL — not auto-allowed by Janus]";
    const content = event.content;
    if (content.length > 0 && content[0].type === "text") {
      return {
        content: [{ ...content[0], text: `${note}\n${content[0].text}` }, ...content.slice(1)],
      };
    }
    return {
      content: [{ type: "text", text: note }, ...content],
    };
  });
}

async function showJanusDialog(
  ctx: ExtensionContext,
  bin: string,
  toolName: string,
  argsJson: string,
  verdict: string,
): Promise<"allow" | "deny" | undefined> {
  const reason = verdict === "deny" ? "denied by a janus rule" : "not covered by any janus rule";
  const preview = formatPreview(toolName, JSON.parse(argsJson) as Record<string, unknown>);

  return ctx.ui.custom<"allow" | "deny" | undefined>((tui, theme, _kb, done) => {
    const container = new Container();

    let showExplanation = false;
    let explanation = "";
    let loadingExplanation = false;
    let selectedIndex = 0;
    let selectList: SelectList;

    function buildItems(): SelectItem[] {
      return [
        { value: "deny", label: "Deny (default)" },
        { value: "allow", label: "Allow this once" },
        { value: "toggle-explain", label: showExplanation ? "Hide explanation" : "Show explanation" },
      ];
    }

    function createSelectList(): SelectList {
      const list = new SelectList(buildItems(), 3, {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      });
      list.setSelectedIndex(Math.min(selectedIndex, 2));
      list.onSelectionChange = (item) => {
        const idx = buildItems().findIndex((i) => i.value === item.value);
        if (idx >= 0) selectedIndex = idx;
      };
      list.onSelect = (item) => {
        if (item.value === "toggle-explain") {
          if (showExplanation) {
            showExplanation = false;
            rebuild();
            tui.requestRender();
          } else {
            loadingExplanation = true;
            rebuild();
            tui.requestRender();
            fetchExplanation(ctx, bin, toolName, argsJson).then((text) => {
              explanation = text;
              loadingExplanation = false;
              showExplanation = true;
              rebuild();
              tui.requestRender();
            });
          }
          return;
        }
        done(item.value as "allow" | "deny");
      };
      list.onCancel = () => done(undefined);
      return list;
    }

    function rebuild() {
      container.clear();

      // Subtle top border — non-blue
      container.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));

      // Title
      container.addChild(new Text(theme.bold("Janus approval required"), 1, 1));

      // Static body
      container.addChild(new Text(theme.fg("text", `Tool: ${toolName}`), 1, 0));
      container.addChild(new Text(theme.fg("text", `Status: ${reason}`), 1, 0));
      if (preview) {
        container.addChild(new Text(theme.fg("muted", "Command:"), 1, 0));
        container.addChild(new Text(theme.fg("mdCode", preview), 1, 0));
      }

      container.addChild(new Spacer(1));

      // Explanation block (toggled inline, same page)
      if (showExplanation || loadingExplanation) {
        container.addChild(new Text(theme.fg("muted", "Why:"), 1, 0));
        if (loadingExplanation) {
          container.addChild(new Text(theme.fg("dim", "Loading explanation…"), 1, 0));
        } else {
          container.addChild(new Text(theme.fg("mdCode", explanation), 1, 0));
        }
        container.addChild(new Spacer(1));
      }

      selectList = createSelectList();
      container.addChild(selectList);

      container.addChild(
        new Text(theme.fg("dim", "↑↓ navigate  ·  enter select  ·  esc cancel"), 1, 0),
      );

      // Subtle bottom border — non-blue
      container.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
    }

    rebuild();

    return {
      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

async function fetchExplanation(
  ctx: ExtensionContext,
  bin: string,
  toolName: string,
  argsJson: string,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      bin,
      ["check", "-e", toolName, argsJson],
      { timeout: JANUS_TIMEOUT_MS, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    return stdout.trim();
  } catch (err) {
    const stderr = err && typeof err === "object" && "stderr" in err ? String(err.stderr) : "";
    const message = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`[janus] explain failed: ${message}${stderr ? `\n${stderr}` : ""}`, "error");
    return "(could not fetch explanation)";
  }
}

function formatPreview(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") {
    return (input.command as string) ?? JSON.stringify(input);
  }
  if (["read", "write", "edit", "glob", "grep"].includes(toolName)) {
    return (
      (input.path as string) ??
      (input.filePath as string) ??
      (input.pattern as string) ??
      JSON.stringify(input)
    );
  }
  return JSON.stringify(input, null, 2).slice(0, 400);
}
