import type { Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
  return streamSimple(
    model as Model<"openai-completions">,
    context,
    options as SimpleStreamOptions,
  );
};

export default function zaiCustomExtension(pi: ExtensionAPI): void {
  const streamSimple = createZaiStreamSimple(streamSimpleViaOpenAICompletions);
  pi.registerProvider("zai-custom", buildZaiProviderConfig({ streamSimple }));
}
