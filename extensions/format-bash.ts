/**
 * Format Bash Chains Extension
 *
 * Renders chained bash commands (&&, ||, ;, |) across multiple lines.
 */

import type { BashToolDetails, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	const originalBash = createBashTool(cwd);

	pi.registerTool({
		name: "bash",
		label: "bash",
		description: originalBash.description,
		parameters: originalBash.parameters,

		async execute(toolCallId, params, signal, onUpdate) {
			return originalBash.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const command = args.command as string;
			const parts = command.split(/(?=&&|\|\||;)/);
			let text = theme.fg("toolTitle", theme.bold("$ "));
			if (parts.length <= 1) {
				text += theme.fg("accent", command);
			} else {
				// Show first part, then each subsequent operator+part on a new line
				text += theme.fg("accent", parts[0].trim());
				for (let i = 1; i < parts.length; i++) {
					text += "\n  " + theme.fg("accent", parts[i].trim());
				}
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) return new Text(theme.fg("warning", "Running..."), 0, 0);

			const details = result.details as BashToolDetails | undefined;
			const content = result.content[0];
			const output = content?.type === "text" ? content.text : "";
			const exitCode = output.match(/exit code: (\d+)/);
			const code = exitCode ? parseInt(exitCode[1], 10) : null;
			const lineCount = output.split("\n").filter((l) => l.trim()).length;

			let text = "";
			if (code === 0 || code === null) {
				text += theme.fg("success", "done");
			} else {
				text += theme.fg("error", `exit ${code}`);
			}
			text += theme.fg("dim", ` (${lineCount} lines)`);
			if (details?.truncation?.truncated) {
				text += theme.fg("warning", " [truncated]");
			}
			if (expanded) {
				const lines = output.split("\n").slice(0, 20);
				for (const line of lines) {
					text += `\n${theme.fg("dim", line)}`;
				}
				if (output.split("\n").length > 20) {
					text += `\n${theme.fg("muted", "... more output")}`;
				}
			}
			return new Text(text, 0, 0);
		},
	});
}
