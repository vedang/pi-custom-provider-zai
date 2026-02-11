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

const providerInput = {
	streamSimple: (() => ({}) as never) as never,
};

const ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

function buildConfig(
	env: Record<string, string | undefined> = {},
): ReturnType<typeof buildZaiProviderConfig> {
	return buildZaiProviderConfig(providerInput, env);
}

function createTestModel() {
	return {
		id: "zai-glm-4.7",
		provider: "zai-custom",
		api: "openai-completions",
		baseUrl: DEFAULT_ZAI_BASE_URL,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1,
		maxTokens: 1,
	};
}

function createCapturedOptionsRecorder() {
	let capturedOptions: Record<string, unknown> | undefined;
	const baseStream = (
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
	return {
		baseStream,
		getCapturedOptions: () => capturedOptions,
	};
}

function assertPayloadKnobs(
	payload: Record<string, unknown>,
	temperature = DEFAULT_TEMPERATURE,
	topP = DEFAULT_TOP_P,
): void {
	assert.equal(payload.temperature, temperature);
	assert.equal(payload.top_p, topP);
	assert.equal(payload.clear_thinking, false);
}

test("index extension registers zai-custom provider", () => {
	const source = readFileSync(indexPath, "utf-8");
	assert.match(source, /registerProvider\([\s\S]*"zai-custom"/);
});

test("buildZaiProviderConfig registers zai-glm-4.7 and default Cerebras URL", () => {
	const config = buildConfig();

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
	assert.equal(config.api, "openai-completions");
	assert.equal(config.models?.[0]?.id, "zai-glm-4.7");
	assert.equal(config.models?.[0]?.reasoning, false);
});

test("buildZaiProviderConfig supports overriding base URL for z.ai endpoint", () => {
	const config = buildConfig({
		PI_ZAI_CUSTOM_BASE_URL: ZAI_CODING_BASE_URL,
	});

	assert.equal(config.baseUrl, ZAI_CODING_BASE_URL);
});

test("buildZaiProviderConfig ignores legacy PI_ZAI_BASE_URL env format", () => {
	const config = buildConfig({
		PI_ZAI_BASE_URL: "https://legacy.example.invalid",
	});

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
});

test("buildZaiProviderConfig ignores legacy ZAI_BASE_URL env format", () => {
	const config = buildConfig({
		ZAI_BASE_URL: "https://legacy.example.invalid",
	});

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
});

test("buildZaiProviderConfig supports API key from PI_ZAI_API_KEY, ZAI_API_KEY, and CEREBRAS_API_KEY", () => {
	assert.equal(buildConfig({ PI_ZAI_API_KEY: "pi-key" }).apiKey, "pi-key");
	assert.equal(buildConfig({ ZAI_API_KEY: "zai-key" }).apiKey, "zai-key");
	assert.equal(
		buildConfig({ CEREBRAS_API_KEY: "cerebras-key" }).apiKey,
		"cerebras-key",
	);
});

test("buildZaiProviderConfig prefers CEREBRAS_API_KEY on Cerebras endpoints when both keys are present", () => {
	const config = buildConfig({
		ZAI_API_KEY: "zai-key",
		CEREBRAS_API_KEY: "cerebras-key",
	});

	assert.equal(config.apiKey, "cerebras-key");
});

test("buildZaiProviderConfig prefers ZAI_API_KEY on z.ai endpoints when both keys are present", () => {
	const config = buildConfig({
		PI_ZAI_CUSTOM_BASE_URL: ZAI_CODING_BASE_URL,
		ZAI_API_KEY: "zai-key",
		CEREBRAS_API_KEY: "cerebras-key",
	});

	assert.equal(config.apiKey, "zai-key");
});

test("buildZaiProviderConfig ignores legacy ZAI_CUSTOM_API_KEY when modern keys exist", () => {
	const config = buildConfig({
		ZAI_CUSTOM_API_KEY: "legacy-key",
		CEREBRAS_API_KEY: "cerebras-key",
	});

	assert.equal(config.apiKey, "cerebras-key");
});

test("applyZaiPayloadKnobs injects temperature/top_p/clear_thinking for Cerebras", () => {
	const payload: Record<string, unknown> = {};

	applyZaiPayloadKnobs(payload, {
		temperature: DEFAULT_TEMPERATURE,
		topP: DEFAULT_TOP_P,
		clearThinking: DEFAULT_CLEAR_THINKING,
		zaiBaseUrl: DEFAULT_ZAI_BASE_URL,
	});

	assertPayloadKnobs(payload);
});

test("applyZaiPayloadKnobs forces clear_thinking=false for z.ai endpoints", () => {
	const payload: Record<string, unknown> = {};

	applyZaiPayloadKnobs(payload, {
		temperature: DEFAULT_TEMPERATURE,
		topP: DEFAULT_TOP_P,
		clearThinking: true,
		zaiBaseUrl: ZAI_CODING_BASE_URL,
	});

	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple enforces payload knobs while preserving caller onPayload", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_TEMPERATURE: "0.42",
		PI_ZAI_CUSTOM_TOP_P: "0.84",
		PI_ZAI_CUSTOM_CLEAR_THINKING: "true",
		PI_ZAI_CUSTOM_BASE_URL: ZAI_CODING_BASE_URL,
	});

	let callerOnPayloadSeen = false;
	streamSimple(
		createTestModel(),
		{ messages: [] },
		{
			onPayload(payload) {
				callerOnPayloadSeen = true;
				(payload as Record<string, unknown>).fromCaller = true;
			},
		},
	);

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, 0.42);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);

	assert.equal(callerOnPayloadSeen, true);
	assert.equal(payload.fromCaller, true);
	assertPayloadKnobs(payload, 0.42, 0.84);
});

test("createZaiStreamSimple ignores legacy non-PI ZAI knob env formats", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		ZAI_TEMPERATURE: "0.01",
		ZAI_TOP_P: "0.02",
		ZAI_CLEAR_THINKING: "true",
	});

	streamSimple(createTestModel(), { messages: [] }, {});

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple ignores legacy PI_ZAI_TEMPERATURE/PI_ZAI_TOP_P/PI_ZAI_CLEAR_THINKING/PI_ZAI_BASE_URL env formats", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_ZAI_TEMPERATURE: "0.01",
		PI_ZAI_TOP_P: "0.02",
		PI_ZAI_CLEAR_THINKING: "true",
		PI_ZAI_BASE_URL: "https://legacy.example.invalid",
	});

	streamSimple(createTestModel(), { messages: [] }, {});

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple prefers options temperature over PI_TEMPERATURE", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_TEMPERATURE: "0.42",
	});

	streamSimple(createTestModel(), { messages: [] }, { temperature: 0.75 });

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, 0.75);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload, 0.75, DEFAULT_TOP_P);
});

test("createZaiStreamSimple treats empty string PI_TEMPERATURE as undefined, falls back to default", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_TEMPERATURE: "",
	});

	streamSimple(createTestModel(), { messages: [] }, {});

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple treats empty string PI_ZAI_CUSTOM_TOP_P as undefined, falls back to default", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_ZAI_CUSTOM_TOP_P: "",
	});

	streamSimple(createTestModel(), { messages: [] }, {});

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple treats empty string PI_ZAI_CUSTOM_CLEAR_THINKING as undefined, falls back to default", () => {
	const recorder = createCapturedOptionsRecorder();
	const streamSimple = createZaiStreamSimple(recorder.baseStream as never, {
		PI_ZAI_CUSTOM_CLEAR_THINKING: "",
	});

	streamSimple(createTestModel(), { messages: [] }, {});

	const capturedOptions = recorder.getCapturedOptions();
	assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);

	const payload: Record<string, unknown> = {};
	(capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
		payload,
	);
	assertPayloadKnobs(payload);
});

test("createZaiStreamSimple treats empty string PI_ZAI_CUSTOM_BASE_URL as undefined, falls back to default", () => {
	const config = buildConfig({
		PI_ZAI_CUSTOM_BASE_URL: "",
	});

	assert.equal(config.baseUrl, DEFAULT_ZAI_BASE_URL);
});
