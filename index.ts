import {
	type Api,
	type AssistantMessageEventStream,
	type Context,
	type Model,
	type SimpleStreamOptions,
	streamSimpleOpenAICompletions,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildZaiProviderConfig, createZaiStreamSimple } from "./config.js";

export default function (pi: ExtensionAPI) {
	const streamSimple = createZaiStreamSimple(
		streamSimpleOpenAICompletions as unknown as (
			model: unknown,
			context: unknown,
			options?: Record<string, unknown>,
		) => unknown,
	) as unknown as (
		model: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	) => AssistantMessageEventStream;

	pi.registerProvider(
		"zai-custom",
		buildZaiProviderConfig({
			streamSimple,
		}),
	);
}
