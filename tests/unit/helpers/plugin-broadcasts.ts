import { vi } from "vitest";
import type { PluginManager } from "../../../server/plugins.js";

/** Observe real broadcasts so test teardown can finish disk reads before deleting fixtures. */
export function trackPluginBroadcasts(manager: PluginManager): () => Promise<void> {
	const broadcasts = vi.spyOn(manager, "pushToAll");
	let consumed = 0;
	return async () => {
		const errors: unknown[] = [];
		// A broadcast can trigger another broadcast; drain those too, without fixed sleeps.
		while (consumed < broadcasts.mock.results.length) {
			const results = broadcasts.mock.results.slice(consumed);
			consumed += results.length;
			const settled = await Promise.allSettled(
				results.map((result) => (result.type === "throw" ? Promise.reject(result.value) : result.value)),
			);
			for (const result of settled) {
				if (result.status === "rejected") errors.push(result.reason);
			}
		}
		if (errors.length) throw new AggregateError(errors, "Plugin broadcasts failed during test teardown");
	};
}
