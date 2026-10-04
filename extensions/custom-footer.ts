/**
 * Custom Footer Extension
 *
 * Replaces the default pi footer with a minimal one showing:
 *   Model  |  Cost  |  Context used %  |  Time to first token
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	let requestRender: (() => void) | null = null;
	let turnStartTime = 0;
	let latestTtft = 0;
	let turnActive = false;
	// TTFT baseline = exchange start. turn_start fires once per LLM round-trip
	// (including every tool-call follow-up), so it must NOT reset the timer.
	let turnStart = 0;
	let ticker: ReturnType<typeof setInterval> | null = null;

	// Per-LLM-call timing: turn_start opens the request (turn_end only fires
	// *after* tool executions, so it can't be used). message_end for the
	// assistant message closes the call — before tools run, so the held
	// duration stays fixed while e.g. a long bash command executes.
	let callStart = 0;
	let lastCallMs = 0;

	// Tool-execution timing: first tool_execution_start opens a window,
	// last tool_execution_end closes it (active-count handles nested/parallel
	// calls). Between windows the last tool duration is held.
	let toolStart = 0;
	let lastToolMs = 0;
	let activeTools = 0;

	// Held after settle so the trio stays visible between exchanges.
	let lastTotalMs = 0;

	// Call counters: LLM calls (turns) and tool calls in this exchange.
	let turnCount = 0;
	let toolCount = 0;

	function startTicker() {
		if (ticker) clearInterval(ticker);
		ticker = setInterval(() => requestRender?.(), 100);
	}

	function stopTicker() {
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	}

	function fmtElapsed(ms: number): string {
		const s = ms / 1000;
		if (s < 60) return `${s.toFixed(1)}s`;
		return `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;
	}

	// Live elapsed timer for the whole exchange (same window turnstats uses)
	pi.on("before_agent_start", async () => {
		turnActive = true;
		turnStartTime = Date.now();
		turnStart = turnStartTime;
		latestTtft = 0;
		callStart = 0;
		lastCallMs = 0;
		toolStart = 0;
		lastToolMs = 0;
		activeTools = 0;
		lastTotalMs = 0;
		turnCount = 0;
		toolCount = 0;
		startTicker();
	});

	pi.on("turn_start", async () => {
		turnCount++;
		callStart = Date.now();
		requestRender?.();
	});

	pi.on("message_end", async (event) => {
		if (event.message.role === "assistant" && callStart > 0) {
			lastCallMs = Date.now() - callStart;
			callStart = 0;
			requestRender?.();
		}
	});

	pi.on("tool_execution_start", async () => {
		if (activeTools === 0) toolStart = Date.now();
		activeTools++;
		toolCount++;
		requestRender?.();
	});

	pi.on("tool_execution_end", async () => {
		if (activeTools > 0) activeTools--;
		if (activeTools === 0 && toolStart > 0) {
			lastToolMs = Date.now() - toolStart;
			toolStart = 0;
		}
		requestRender?.();
	});

	pi.on("agent_settled", async () => {
		turnActive = false;
		if (turnStartTime > 0) lastTotalMs = Date.now() - turnStartTime;
		stopTicker();
		requestRender?.();
	});

	pi.on("message_update", async (event) => {
		// Capture TTFT on first content chunk of an assistant response
		if (
			event.message.role === "assistant" &&
			turnStart > 0 &&
			latestTtft === 0 &&
			event.message.content?.length
		) {
			latestTtft = Date.now() - turnStart;
			requestRender?.();
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: () => {
					unsub();
					requestRender = null;
				},
				invalidate() {},
				render(width: number): string[] {
					// Compute totals from session history
					let cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							cost += m.usage.cost.total;
						}
					}

					// Context usage percentage
					const contextUsage = ctx.getContextUsage();
					const contextWindow = ctx.model?.contextWindow ?? 200_000;
					const pct =
						contextUsage && contextWindow > 0 && contextUsage.tokens != null
							? Math.round((contextUsage.tokens / contextWindow) * 100)
							: 0;

					const model = ctx.model?.id ?? "no-model";
					const ttft =
						latestTtft > 0
							? `${(latestTtft / 1000).toFixed(1)}s`
							: turnStartTime > 0
								? "..."
								: "";

					const parts = [
						`model: ${model}`,
						`cost: $${cost.toFixed(3)}`,
						`ctx: ${pct}%`,
					];
					if (ttft) parts.push(`ttft: ${ttft}`);

					// Timing trio on the statuses line: total (whole exchange),
					// llm (current/last call), tool (current/last tool window).
					// While running they tick (driven by the 100ms ticker); after
					// settle the final values are held until the next exchange.
					const timingParts: string[] = [];
					if (turnActive && turnStartTime > 0) {
						timingParts.push(theme.fg("dim", `total: ${fmtElapsed(Date.now() - turnStartTime)}`));
						if (callStart > 0) {
							timingParts.push(theme.fg("dim", `llm: ${fmtElapsed(Date.now() - callStart)} (${turnCount})`));
						} else if (lastCallMs > 0) {
							timingParts.push(theme.fg("dim", `llm: ${fmtElapsed(lastCallMs)} (${turnCount})`));
						}
						if (activeTools > 0 && toolStart > 0) {
							timingParts.push(theme.fg("dim", `tool: ${fmtElapsed(Date.now() - toolStart)} (${toolCount})`));
						} else if (lastToolMs > 0) {
							timingParts.push(theme.fg("dim", `tool: ${fmtElapsed(lastToolMs)} (${toolCount})`));
						}
					} else if (lastTotalMs > 0) {
						timingParts.push(theme.fg("dim", `total: ${fmtElapsed(lastTotalMs)}`));
						if (lastCallMs > 0) timingParts.push(theme.fg("dim", `llm: ${fmtElapsed(lastCallMs)} (${turnCount})`));
						if (lastToolMs > 0) timingParts.push(theme.fg("dim", `tool: ${fmtElapsed(lastToolMs)} (${toolCount})`));
					} else {
						// Nothing yet this session: show the line with zero values.
						timingParts.push(theme.fg("dim", "total: 0s"));
						timingParts.push(theme.fg("dim", "llm: 0s (0)"));
						timingParts.push(theme.fg("dim", "tool: 0s (0)"));
					}

					// Extension statuses on their own line, like the default
					// footer: sorted by key, sanitized, truncated. turn-stats is
					// excluded entirely — the timing trio is our own replacement.
					const statuses = Array.from(footerData.getExtensionStatuses().entries())
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([key, text]) => {
							if (key === "turn-stats") return "";
							return text
								.replace(/[\r\n\t]/g, " ")
								.replace(/ +/g, " ")
								.trim();
						});

					const lines = [
						truncateToWidth(theme.fg("dim", parts.join("  -  ")), width),
					];
					const statusParts = [...timingParts, ...statuses.filter((s) => s !== "")];
					if (statusParts.length > 0) {
						// Dim the separators too — a raw join renders them in the
						// default (white) text color.
						const joined = statusParts
							.map((p, i) => (i > 0 ? theme.fg("dim", "  -  ") + p : p))
							.join("");
						lines.push(truncateToWidth(joined, width, theme.fg("dim", "...")));
					}
					return lines;
				},
			};
		});
	});
}
