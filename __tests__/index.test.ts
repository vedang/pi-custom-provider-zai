import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	DEFAULT_CLEAR_THINKING,
	DEFAULT_TEMPERATURE,
	DEFAULT_TOP_P,
	DEFAULT_ZAI_BASE_URL,
	applyZaiPayloadKnobs,
	buildZaiProviderConfig,
	createZaiStreamSimple,
} from "../config";

const indexPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"index.ts",
);

test("index extension registers zai-custom provider", () => {
	const source = readFileSync(indexPath, "utf-8");
	assert.match(source, /registerProvider\([\s\S]*"zai-custom"/);
});

test("buildZaiProviderConfig registers zai-glm-4.7 and default Cerebras URL", () => {
	const config = buildZaiProviderConfig(
		{
			streamSimple: (() => ({}) as never) as never,
		},
		{},
	);

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
	assert.equal(config.api, "openai-completions");
	assert.equal(config.models?.[0]?.id, "zai-glm-4.7");
});

test("buildZaiProviderConfig supports overriding base URL for z.ai endpoint", () => {
	const config = buildZaiProviderConfig(
		{
			streamSimple: (() => ({}) as never) as never,
		},
		{ PI_ZAI_BASE_URL: "https://api.z.ai/api/coding/paas/v4" },
	);

	assert.equal(config.baseUrl, "https://api.z.ai/api/coding/paas/v4");
});

test("buildZaiProviderConfig ignores legacy ZAI_BASE_URL env format", () => {
	const config = buildZaiProviderConfig(
		{
			streamSimple: (() => ({}) as never) as never,
		},
		{ ZAI_BASE_URL: "https://legacy.example.invalid" },
	);

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
});

test("buildZaiProviderConfig supports API key from PI_ZAI_API_KEY, ZAI_API_KEY, and CEREBRAS_API_KEY", () => {
	const build = (env: Record<string, string>) =>
		buildZaiProviderConfig(
			{
				streamSimple: (() => ({}) as never) as never,
			},
			env,
		).apiKey;

	assert.equal(build({ PI_ZAI_API_KEY: "pi-key" }), "pi-key");
	assert.equal(build({ ZAI_API_KEY: "zai-key" }), "zai-key");
	assert.equal(build({ CEREBRAS_API_KEY: "cerebras-key" }), "cerebras-key");
});

test("buildZaiProviderConfig ignores legacy ZAI_CUSTOM_API_KEY when modern keys exist", () => {
	const config = buildZaiProviderConfig(
		{
			streamSimple: (() => ({}) as never) as never,
		},
		{
			ZAI_CUSTOM_API_KEY: "legacy-key",
			CEREBRAS_API_KEY: "cerebras-key",
		},
	);

	assert.equal(config.apiKey, "cerebras-key");
});

test("applyZaiPayloadKnobs injects temperature/top_p/clear_thinking", () => {
	const payload: Record<string, unknown> = {};

	applyZaiPayloadKnobs(payload, {
		temperature: DEFAULT_TEMPERATURE,
		topP: DEFAULT_TOP_P,
		clearThinking: DEFAULT_CLEAR_THINKING,
		zaiBaseUrl: DEFAULT_ZAI_BASE_URL,
	});

	assert.equal(payload.temperature, DEFAULT_TEMPERATURE);
	assert.equal(payload.top_p, DEFAULT_TOP_P);
	assert.equal(payload.clear_thinking, DEFAULT_CLEAR_THINKING);
});

test("createZaiStreamSimple enforces payload knobs while preserving caller onPayload", () => {
	let capturedOptions: Record<string, unknown> | undefined;
	const mockBaseStream = (
		_model: unknown,
		_context: unknown,
		options?: Record<string, unknown>,
	) => {
		capturedOptions = options;
		return {
			push() {},
			end() {},
		} as never;
	};

	const streamSimple = createZaiStreamSimple(mockBaseStream as never, {
		PI_ZAI_TEMPERATURE: "0.42",
		PI_ZAI_TOP_P: "0.84",
		PI_ZAI_CLEAR_THINKING: "true",
		PI_ZAI_BASE_URL: "https://api.z.ai/api/coding/paas/v4",
	});

	let callerOnPayloadSeen = false;
	streamSimple(
		{
			id: "zai-glm-4.7",
			provider: "zai-custom",
			api: "openai-completions",
			baseUrl: DEFAULT_ZAI_BASE_URL,
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1,
			maxTokens: 1,
		},
		{ messages: [] },
		{
			onPayload(payload) {
				callerOnPayloadSeen = true;
				(payload as Record<string, unknown>).fromCaller = true;
			},
		},
	);

	assert.equal(capturedOptions?.temperature, 0.42);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);

	assert.equal(callerOnPayloadSeen, true);
	assert.equal(payload.fromCaller, true);
	assert.equal(payload.temperature, 0.42);
	assert.equal(payload.top_p, 0.84);
	assert.equal(payload.clear_thinking, true);
});

test("createZaiStreamSimple ignores legacy non-PI ZAI knob env formats", () => {
	let capturedOptions: Record<string, unknown> | undefined;
	const mockBaseStream = (
		_model: unknown,
		_context: unknown,
		options?: Record<string, unknown>,
	) => {
		capturedOptions = options;
		return {
			push() {},
			end() {},
		} as never;
	};

	const streamSimple = createZaiStreamSimple(mockBaseStream as never, {
		ZAI_TEMPERATURE: "0.01",
		ZAI_TOP_P: "0.02",
		ZAI_CLEAR_THINKING: "true",
	});

	streamSimple(
		{
			id: "zai-glm-4.7",
			provider: "zai-custom",
			api: "openai-completions",
			baseUrl: DEFAULT_ZAI_BASE_URL,
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1,
			maxTokens: 1,
		},
		{ messages: [] },
		{},
	);

	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assert.equal(payload.temperature, DEFAULT_TEMPERATURE);
	assert.equal(payload.top_p, DEFAULT_TOP_P);
	assert.equal(payload.clear_thinking, DEFAULT_CLEAR_THINKING);
});
