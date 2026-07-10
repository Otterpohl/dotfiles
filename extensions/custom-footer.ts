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

	pi.on("turn_start", async () => {
		turnStartTime = Date.now();
		latestTtft = 0;
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
						contextUsage && contextWindow > 0
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

					return [
						truncateToWidth(theme.fg("dim", parts.join("  -  ")), width),
					];
				},
			};
		});
	});
}
