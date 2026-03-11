import {
  type Model,
  type SimpleStreamOptions,
  streamSimpleOpenAICompletions,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type ZaiStreamSimple,
  buildZaiProviderConfig,
  createZaiStreamSimple,
} from "./core.js";

const streamSimpleViaOpenAICompletions: ZaiStreamSimple = (
  model,
  context,
  options,
) => {
  return streamSimpleOpenAICompletions(
    model as Model<"openai-completions">,
    context,
    options as SimpleStreamOptions,
  );
};

export default function zaiCustomExtension(pi: ExtensionAPI): void {
  const streamSimple = createZaiStreamSimple(streamSimpleViaOpenAICompletions);
  pi.registerProvider("zai-custom", buildZaiProviderConfig({ streamSimple }));
}
