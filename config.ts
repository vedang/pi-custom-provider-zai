export const DEFAULT_ZAI_BASE_URL = "https://api.cerebras.ai/v1";
export const DEFAULT_TEMPERATURE = 0.9;
export const DEFAULT_TOP_P = 0.95;
export const DEFAULT_CLEAR_THINKING = false;

export interface ZaiRuntimeSettings {
	temperature: number;
	topP: number;
	clearThinking: boolean;
	zaiBaseUrl: string;
}

export interface ZaiSimpleOptions {
	temperature?: number;
	top_p?: number;
	topP?: number;
	clear_thinking?: boolean;
	clearThinking?: boolean;
	onPayload?: (payload: unknown) => void;
	[key: string]: unknown;
}

export type ZaiStreamSimple = (
	model: unknown,
	context: unknown,
	options?: ZaiSimpleOptions,
) => unknown;

export interface ZaiProviderConfigInput {
	streamSimple: ZaiStreamSimple;
}

function parseOptionalNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number.parseFloat(trimmed);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
		if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
	}
	return undefined;
}

function parseOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
	for (const value of values) {
		if (value !== undefined) return value;
	}
	return undefined;
}

export function resolveZaiRuntimeSettings(
	env: Record<string, string | undefined> = process.env,
	options?: ZaiSimpleOptions,
): ZaiRuntimeSettings {
	const temperature =
		firstDefined(
			parseOptionalNumber(env.PI_ZAI_TEMPERATURE),
			parseOptionalNumber(env.ZAI_TEMPERATURE),
			parseOptionalNumber(env.ZAI_CUSTOM_TEMPERATURE),
			parseOptionalNumber(options?.temperature),
		) ?? DEFAULT_TEMPERATURE;

	const topP =
		firstDefined(
			parseOptionalNumber(env.PI_ZAI_TOP_P),
			parseOptionalNumber(env.ZAI_TOP_P),
			parseOptionalNumber(env.ZAI_CUSTOM_TOP_P),
			parseOptionalNumber(options?.top_p),
			parseOptionalNumber(options?.topP),
		) ?? DEFAULT_TOP_P;

	const clearThinking =
		firstDefined(
			parseOptionalBoolean(env.PI_ZAI_CLEAR_THINKING),
			parseOptionalBoolean(env.ZAI_CLEAR_THINKING),
			parseOptionalBoolean(env.ZAI_CUSTOM_CLEAR_THINKING),
			parseOptionalBoolean(options?.clear_thinking),
			parseOptionalBoolean(options?.clearThinking),
		) ?? DEFAULT_CLEAR_THINKING;

	const zaiBaseUrl =
		firstDefined(
			parseOptionalString(env.PI_ZAI_BASE_URL),
			parseOptionalString(env.ZAI_BASE_URL),
			parseOptionalString(env.ZAI_CUSTOM_BASE_URL),
		) ?? DEFAULT_ZAI_BASE_URL;

	return {
		temperature,
		topP,
		clearThinking,
		zaiBaseUrl,
	};
}

/**
 * [tag:zai_custom_payload_knobs]
 * Every request must carry explicit sampling/thinking knobs so provider defaults
 * cannot silently change behavior across endpoints.
 */
export function applyZaiPayloadKnobs(
	payload: unknown,
	runtime: ZaiRuntimeSettings,
): void {
	if (!payload || typeof payload !== "object") return;
	const request = payload as Record<string, unknown>;
	request.temperature = runtime.temperature;
	request.top_p = runtime.topP;
	request.clear_thinking = runtime.clearThinking;
}

/**
 * [tag:zai_custom_env_knob_contract]
 * Subagent frontmatter knobs are threaded into child processes via PI_ZAI_* env
 * vars, then consumed here for per-role provider behavior.
 */
export function createZaiStreamSimple(
	baseStreamSimple: ZaiStreamSimple,
	env: Record<string, string | undefined> = process.env,
): ZaiStreamSimple {
	return (model, context, options) => {
		const runtime = resolveZaiRuntimeSettings(env, options);
		const callerOnPayload = options?.onPayload;
		const wrappedOptions: ZaiSimpleOptions = {
			...options,
			temperature: runtime.temperature,
			onPayload: (payload: unknown) => {
				callerOnPayload?.(payload);
				// [ref:zai_custom_payload_knobs]
				applyZaiPayloadKnobs(payload, runtime);
			},
		};
		return baseStreamSimple(model, context, wrappedOptions);
	};
}

function resolveApiKey(env: Record<string, string | undefined>): string {
	return (
		firstDefined(
			parseOptionalString(env.PI_ZAI_API_KEY),
			parseOptionalString(env.ZAI_CUSTOM_API_KEY),
			parseOptionalString(env.ZAI_API_KEY),
			parseOptionalString(env.CEREBRAS_API_KEY),
		) ?? "ZAI_CUSTOM_API_KEY"
	);
}

export function buildZaiProviderConfig(
	input: ZaiProviderConfigInput,
	env: Record<string, string | undefined> = process.env,
): {
	baseUrl: string;
	apiKey: string;
	api: "openai-completions";
	streamSimple: ZaiStreamSimple;
	models: Array<{
		id: string;
		name: string;
		reasoning: boolean;
		input: ["text"];
		cost: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
		};
		contextWindow: number;
		maxTokens: number;
		compat: {
			supportsDeveloperRole: false;
			thinkingFormat: "zai";
		};
	}>;
} {
	const runtime = resolveZaiRuntimeSettings(env);
	return {
		baseUrl: runtime.zaiBaseUrl,
		apiKey: resolveApiKey(env),
		api: "openai-completions",
		streamSimple: input.streamSimple,
		models: [
			{
				id: "zai-glm-4.7",
				name: "ZAI GLM-4.7",
				reasoning: true,
				input: ["text"],
				cost: {
					input: 0.6,
					output: 2.2,
					cacheRead: 0.11,
					cacheWrite: 0,
				},
				contextWindow: 204800,
				maxTokens: 131072,
				compat: {
					supportsDeveloperRole: false,
					thinkingFormat: "zai",
				},
			},
		],
	};
}
