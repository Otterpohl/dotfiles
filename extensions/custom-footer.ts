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
	let ticker: ReturnType<typeof setInterval> | null = null;

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

	pi.on("turn_start", async () => {
		turnStartTime = Date.now();
		latestTtft = 0;
	});

	// Live elapsed timer for the whole exchange (same window turnstats uses)
	pi.on("before_agent_start", async () => {
		turnActive = true;
		turnStartTime = Date.now();
		startTicker();
	});

	pi.on("agent_settled", async () => {
		turnActive = false;
		stopTicker();
		requestRender?.();
	});

	pi.on("message_update", async (event) => {
		// Capture TTFT on first content chunk of an assistant response
		if (
			event.message.role === "assistant" &&
			turnStartTime > 0 &&
			latestTtft === 0 &&
			event.message.content?.length
		) {
			latestTtft = Date.now() - turnStartTime;
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

					// Extension statuses (e.g. turnstats) on their own line,
					// like the default footer: sorted by key, sanitized, truncated.
					// While the agent is running, replace turnstats' "Processing…"
					// placeholder with a live elapsed timer.
					const statuses = Array.from(footerData.getExtensionStatuses().entries())
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([key, text]) => {
							if (key === "turn-stats" && turnActive && turnStartTime > 0) {
								return theme.fg("dim", `⏱ ${fmtElapsed(Date.now() - turnStartTime)}`);
							}
							return text
								.replace(/[\r\n\t]/g, " ")
								.replace(/ +/g, " ")
								.trim();
						});

					const lines = [
						truncateToWidth(theme.fg("dim", parts.join("  -  ")), width),
					];
					if (statuses.length > 0) {
						lines.push(truncateToWidth(statuses.join(" "), width, theme.fg("dim", "...")));
					}
					return lines;
				},
			};
		});
	});
}
