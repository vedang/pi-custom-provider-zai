import {
  type Model,
  type SimpleStreamOptions,
  openAICompletionsApi,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type ZaiStreamSimple,
  buildZaiProviderConfig,
  createZaiStreamSimple,
} from "./core.js";

const openAICompletions = openAICompletionsApi();

const streamSimpleViaOpenAICompletions: ZaiStreamSimple = (
  model,
  context,
  options,
) => {
  return openAICompletions.streamSimple(
    model as Model<"openai-completions">,
    context,
    options as SimpleStreamOptions,
  );
};

export default function zaiCustomExtension(pi: ExtensionAPI): void {
  const streamSimple = createZaiStreamSimple(streamSimpleViaOpenAICompletions);
  pi.registerProvider("zai-custom", buildZaiProviderConfig({ streamSimple }));
}
