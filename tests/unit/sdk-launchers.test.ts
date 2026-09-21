import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../bin/pi-web-ui.mjs", import.meta.url), "utf8");

function functionSource(name: string): string {
	const start = source.indexOf(`function ${name}(`);
	if (start < 0) throw new Error(`Missing CLI function: ${name}`);
	return source.slice(start, source.indexOf("\n}", start) + 2);
}

function harness(hasHook: boolean) {
	const sdkHook = join(tmpdir(), "pi sdk #260", "resolve-global-sdk.js");
	const names = [
		"psQuote",
		"shQuote",
		"buildWinStartPs1",
		"buildWinShortcutPs1",
		"buildMacShortcut",
		"buildLinuxStartScript",
	];
	const cli = runInNewContext(`${names.map(functionSource).join("\n")}\n({ ${names.join(", ")} })`, {
		SDK_HOOK: sdkHook,
		HAS_SDK_HOOK: hasHook,
		SERVER_ENTRY: join(tmpdir(), "pi sdk #260", "index.js"),
		realNode: () => process.execPath,
		pathToFileURL,
		join,
		homedir: tmpdir,
	}) as Record<string, (...args: unknown[]) => string>;
	return { cli, sdkHook };
}

describe("SDK preload in generated launchers", () => {
	it.each([true, false])("Windows service and shortcut use file URLs; hook present = %s", (hasHook) => {
		const { cli, sdkHook } = harness(hasHook);
		const scripts = [
			cli.buildWinStartPs1({}, tmpdir(), "server.log", "server.pid"),
			cli.buildWinShortcutPs1({}, tmpdir(), "pi-web-ui", "http://localhost:8900", "server.log", "server.pid"),
		];
		for (const script of scripts) {
			if (hasHook) expect(script).toContain(`--import '${pathToFileURL(sdkHook).href}'`);
			else expect(script).not.toContain("--import");
		}
	});

	it.each([true, false])(
		"Unix shortcuts keep hook and entry as separate quoted arguments; hook present = %s",
		(hasHook) => {
			const { cli, sdkHook } = harness(hasHook);
			const scripts = [
				cli.buildMacShortcut("pi-web-ui", "/tmp/service.plist", "http://localhost:8900", {}),
				cli.buildLinuxStartScript("pi-web-ui", "http://localhost:8900"),
			];
			for (const script of scripts) {
				expect(script).not.toContain("SDK_HOOK_ARG");
				if (hasHook) expect(script).toContain(`"$NODE" --import ${cli.shQuote(sdkHook)} "$ENTRY"`);
				else expect(script).toContain('"$NODE" "$ENTRY"');
			}
		},
	);
});
