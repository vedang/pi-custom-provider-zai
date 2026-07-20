import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

import {
  CEREBRAS_BASE_URL,
  DEFAULT_CLEAR_THINKING,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  ZAI_BASE_URL,
  type ZaiProviderConfig,
  type ZaiRuntimeSettings,
  applyZaiPayloadKnobs,
  buildZaiProviderConfig,
  createZaiStreamSimple,
} from "../src/core";

const indexPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "index.ts",
);

const providerInput = {
  streamSimple: (() => ({}) as never) as never,
};

function buildConfig(
  env: Record<string, string | undefined> = {},
): ReturnType<typeof buildZaiProviderConfig> {
  return buildZaiProviderConfig(providerInput, env);
}

function createTestModel(id = "zai-glm-4.7") {
  return {
    id,
    name: `Test model ${id}`,
    provider: "zai-custom",
    api: "openai-completions",
    baseUrl: "https://example.invalid/v1",
    reasoning: false,
    input: ["text"] as Array<"text" | "image">,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1,
    maxTokens: 1,
  };
}

function createCapturedInvocationRecorder() {
  let capturedOptions: Record<string, unknown> | undefined;
  let capturedModel: Record<string, unknown> | undefined;
  const baseStream = (
    model: unknown,
    _context: unknown,
    options?: Record<string, unknown>,
  ) => {
    capturedModel = model as Record<string, unknown>;
    capturedOptions = options;
    return {
      push() {},
      end() {},
    } as never;
  };
  return {
    baseStream,
    getCapturedOptions: () => capturedOptions,
    getCapturedModel: () => capturedModel,
  };
}

function assertPayloadKnobs(
  payload: Record<string, unknown>,
  temperature = DEFAULT_TEMPERATURE,
  topP = DEFAULT_TOP_P,
  clearThinking = DEFAULT_CLEAR_THINKING,
): void {
  assert.equal(payload.temperature, temperature);
  assert.equal(payload.top_p, topP);
  assert.equal(payload.clear_thinking, clearThinking);
}

function buildRuntimeSettings(
  overrides: Partial<ZaiRuntimeSettings> = {},
): ZaiRuntimeSettings {
  return {
    temperature: DEFAULT_TEMPERATURE,
    topP: DEFAULT_TOP_P,
    clearThinking: DEFAULT_CLEAR_THINKING,
    ...overrides,
  };
}

function applyKnobsWithRuntime(
  overrides: Partial<ZaiRuntimeSettings> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  applyZaiPayloadKnobs(payload, buildRuntimeSettings(overrides));
  return payload;
}

async function invokeCapturedOnPayload(
  capturedOptions: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  await (
    capturedOptions?.onPayload as ((payload: unknown) => unknown) | undefined
  )?.(payload);
  return payload;
}

function createStreamRecorderWithEnv(env: Record<string, string | undefined>) {
  const recorder = createCapturedInvocationRecorder();
  const streamSimple = createZaiStreamSimple(recorder.baseStream as never, env);

  return {
    recorder,
    streamSimple,
  };
}

type ExpectedModelProps = {
  id: string;
  name: string;
  reasoning: boolean;
  baseUrl: string;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow?: number;
  maxTokens?: number;
};

function assertModelProps(
  model: ZaiProviderConfig["models"][number],
  expected: ExpectedModelProps,
) {
  assert.equal(model.id, expected.id);
  assert.equal(model.name, expected.name);
  assert.equal(model.reasoning, expected.reasoning);
  assert.equal(model.baseUrl, expected.baseUrl);
  assert.equal("apiKey" in model, false);
  assert.deepEqual(model.cost, expected.cost);
  if (expected.contextWindow !== undefined) {
    assert.equal(model.contextWindow, expected.contextWindow);
  }
  if (expected.maxTokens !== undefined) {
    assert.equal(model.maxTokens, expected.maxTokens);
  }
}

function assertModelList(
  models: ZaiProviderConfig["models"],
  expectedModels: ExpectedModelProps[],
) {
  assert.equal(models.length, expectedModels.length);
  for (const [index, expectedModel] of expectedModels.entries()) {
    assertModelProps(models[index], expectedModel);
  }
}

test("index extension registers zai-custom provider", () => {
  const source = readFileSync(indexPath, "utf-8");
  assert.match(source, /registerProvider\([\s\S]*"zai-custom"/);
});

test("index uses the public OpenAI completions provider factory", () => {
  const source = readFileSync(indexPath, "utf-8");

  assert.doesNotMatch(source, /@earendil-works\/pi-ai\/api\//);
  assert.match(source, /openAICompletionsApi/);
});

test("buildZaiProviderConfig returns no models or ambiguous key when no provider keys are configured", () => {
  const config = buildConfig();

  assert.equal(config.api, "openai-completions");
  assert.equal(config.baseUrl, CEREBRAS_BASE_URL);
  assert.equal(config.apiKey, undefined);
  assert.equal(config.models.length, 0);
});

test("buildZaiProviderConfig registers Cerebras models with an env key reference", () => {
  const config = buildConfig({
    CEREBRAS_API_KEY: "cerebras-key",
  });

  assert.equal(config.apiKey, "$CEREBRAS_API_KEY");
  assert.equal(config.models.length, 1);
  assert.equal(config.models[0].id, "zai-glm-4.7");
  assert.equal(config.models[0].name, "GLM-4.7 Cerebras");
  assert.equal(config.models[0].reasoning, false);
  assert.equal(config.models[0].baseUrl, CEREBRAS_BASE_URL);
  assert.equal("apiKey" in config.models[0], false);
  assert.deepEqual(config.models[0].cost, {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.equal(config.models[0].contextWindow, 131072);
  assert.equal(config.models[0].maxTokens, 40000);
  assert.equal(
    config.models.some((model) => model.id === "glm-5"),
    false,
  );
});

test("buildZaiProviderConfig registers ZAI models with modern thinking metadata", () => {
  const config = buildConfig({
    ZAI_API_KEY: "zai-key",
  });
  const expectedModels: ExpectedModelProps[] = [
    {
      id: "glm-4.7",
      name: "GLM 4.7 ZAI",
      reasoning: true,
      baseUrl: ZAI_BASE_URL,
      cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
    },
    {
      id: "glm-5",
      name: "GLM-5 (ZAI)",
      reasoning: true,
      baseUrl: ZAI_BASE_URL,
      cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    },
    {
      id: "glm-5-turbo",
      name: "GLM-5 Turbo (ZAI)",
      reasoning: true,
      baseUrl: ZAI_BASE_URL,
      cost: { input: 1.2, output: 4.0, cacheRead: 0, cacheWrite: 0 },
    },
    {
      id: "glm-5.1",
      name: "GLM-5.1 (ZAI)",
      reasoning: true,
      baseUrl: ZAI_BASE_URL,
      cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2 (ZAI)",
      reasoning: true,
      baseUrl: ZAI_BASE_URL,
      cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
      contextWindow: 1_000_000,
      maxTokens: 128_000,
    },
  ];

  assert.equal(config.apiKey, "$ZAI_API_KEY");
  assertModelList(config.models, expectedModels);
  assert.deepEqual(config.models.at(-1)?.thinkingLevelMap, {
    minimal: null,
    low: "high",
    medium: "high",
    high: "high",
    max: "max",
  });
});

function assertHasModel(
  models: ZaiProviderConfig["models"],
  expected: {
    id: string;
    baseUrl: string;
  },
) {
  assert.equal(
    models.some(
      (model) => model.id === expected.id && model.baseUrl === expected.baseUrl,
    ),
    true,
    `Expected to find model with id=${expected.id}`,
  );
}

function assertHasModels(
  models: ZaiProviderConfig["models"],
  expectedModels: Array<{
    id: string;
    baseUrl: string;
  }>,
) {
  assert.equal(models.length, expectedModels.length);
  for (const expectedModel of expectedModels) {
    assertHasModel(models, expectedModel);
  }
  assert.equal(
    models.some((model) => "apiKey" in model),
    false,
  );
}

test("buildZaiProviderConfig registers both model sets with one explicit provider key reference", () => {
  const config = buildConfig({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });
  const expectedModels = [
    { id: "zai-glm-4.7", baseUrl: CEREBRAS_BASE_URL },
    { id: "glm-4.7", baseUrl: ZAI_BASE_URL },
    { id: "glm-5", baseUrl: ZAI_BASE_URL },
    { id: "glm-5-turbo", baseUrl: ZAI_BASE_URL },
    { id: "glm-5.1", baseUrl: ZAI_BASE_URL },
    { id: "glm-5.2", baseUrl: ZAI_BASE_URL },
  ];

  assert.equal(config.apiKey, "$CEREBRAS_API_KEY");
  assertHasModels(config.models, expectedModels);
});

test("buildZaiProviderConfig ignores PI_ZAI_API_KEY and legacy ZAI_CUSTOM_API_KEY", () => {
  const config = buildConfig({
    PI_ZAI_API_KEY: "legacy-explicit-key",
    ZAI_CUSTOM_API_KEY: "legacy-custom-key",
  });

  assert.equal(config.models.length, 0);
});

test("buildZaiProviderConfig ignores all base-url env overrides", () => {
  const config = buildConfig({
    CEREBRAS_API_KEY: "cerebras-key",
    PI_ZAI_CUSTOM_BASE_URL: "https://api.z.ai/api/coding/paas/v4",
    PI_ZAI_BASE_URL: "https://legacy.example.invalid",
    ZAI_BASE_URL: "https://legacy.example.invalid",
  });

  assert.equal(config.baseUrl, CEREBRAS_BASE_URL);
  assert.equal(config.models[0].baseUrl, CEREBRAS_BASE_URL);
});

test("applyZaiPayloadKnobs injects temperature/top_p/clear_thinking", () => {
  const payload = applyKnobsWithRuntime();

  assertPayloadKnobs(payload);
});

test("applyZaiPayloadKnobs respects clear_thinking knob", () => {
  const payload = applyKnobsWithRuntime({ clearThinking: true });

  assertPayloadKnobs(payload, DEFAULT_TEMPERATURE, DEFAULT_TOP_P, true);
});

test("createZaiStreamSimple routes Cerebras model IDs to Cerebras endpoint and request key", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(createTestModel("zai-glm-4.7"), { messages: [] }, {});

  const capturedModel = recorder.getCapturedModel();
  const capturedOptions = recorder.getCapturedOptions();
  assert.equal(capturedModel?.baseUrl, CEREBRAS_BASE_URL);
  assert.equal("apiKey" in (capturedModel ?? {}), false);
  assert.equal(capturedOptions?.apiKey, "cerebras-key");
});

test("createZaiStreamSimple routes ZAI model IDs to ZAI endpoint and request key", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(createTestModel("glm-5.2"), { messages: [] }, {});

  const capturedModel = recorder.getCapturedModel();
  const capturedOptions = recorder.getCapturedOptions();
  assert.equal(capturedModel?.baseUrl, ZAI_BASE_URL);
  assert.equal("apiKey" in (capturedModel ?? {}), false);
  assert.equal(capturedOptions?.apiKey, "zai-key");
});

test("createZaiStreamSimple overrides caller apiKey with routed ZAI key for ZAI model IDs", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(
    createTestModel("glm-5.1"),
    { messages: [] },
    { apiKey: "cerebras-key" },
  );

  const capturedModel = recorder.getCapturedModel();
  const capturedOptions = recorder.getCapturedOptions();
  assert.equal("apiKey" in (capturedModel ?? {}), false);
  assert.equal(capturedOptions?.apiKey, "zai-key");
});

test("createZaiStreamSimple overrides caller apiKey with routed Cerebras key for Cerebras model IDs", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(
    createTestModel("zai-glm-4.7"),
    { messages: [] },
    { apiKey: "zai-key" },
  );

  const capturedModel = recorder.getCapturedModel();
  const capturedOptions = recorder.getCapturedOptions();
  assert.equal("apiKey" in (capturedModel ?? {}), false);
  assert.equal(capturedOptions?.apiKey, "cerebras-key");
});

test("createZaiStreamSimple applies knobs to async caller payload replacements", async () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    ZAI_API_KEY: "zai-key",
  });
  const replacement = { fromReplacement: true };

  streamSimple(
    createTestModel("glm-4.7"),
    { messages: [] },
    {
      async onPayload() {
        return replacement;
      },
    },
  );

  const capturedOptions = recorder.getCapturedOptions();
  const returnedPayload = await (
    capturedOptions?.onPayload as
      | ((payload: unknown, model: unknown) => unknown)
      | undefined
  )?.({}, createTestModel("glm-4.7"));

  assert.equal(returnedPayload, replacement);
  assertPayloadKnobs(replacement);
});

test("createZaiStreamSimple enforces payload knobs while preserving caller onPayload", async () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    PI_TEMPERATURE: "0.42",
    PI_ZAI_CUSTOM_TOP_P: "0.84",
    PI_ZAI_CUSTOM_CLEAR_THINKING: "true",
    ZAI_API_KEY: "zai-key",
  });

  let callerOnPayloadSeen = false;
  streamSimple(
    createTestModel("glm-4.7"),
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

  const payload = await invokeCapturedOnPayload(capturedOptions);

  assert.equal(callerOnPayloadSeen, true);
  assert.equal(payload.fromCaller, true);
  assertPayloadKnobs(payload, 0.42, 0.84, true);
});

test("createZaiStreamSimple ignores legacy env knob formats", async () => {
  const legacyEnvCases = [
    {
      ZAI_TEMPERATURE: "0.01",
      ZAI_TOP_P: "0.02",
      ZAI_CLEAR_THINKING: "true",
      ZAI_API_KEY: "zai-key",
    },
    {
      PI_ZAI_TEMPERATURE: "0.01",
      PI_ZAI_TOP_P: "0.02",
      PI_ZAI_CLEAR_THINKING: "true",
      PI_ZAI_BASE_URL: "https://legacy.example.invalid",
      ZAI_API_KEY: "zai-key",
    },
  ];

  for (const env of legacyEnvCases) {
    const { recorder, streamSimple } = createStreamRecorderWithEnv(env);

    streamSimple(createTestModel("glm-4.7"), { messages: [] }, {});

    const capturedOptions = recorder.getCapturedOptions();
    assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);
    assertPayloadKnobs(await invokeCapturedOnPayload(capturedOptions));
  }
});

test("createZaiStreamSimple env knobs override or preserve option behavior as expected", async () => {
  const cases = [
    {
      env: {
        PI_TEMPERATURE: "0.42",
        CEREBRAS_API_KEY: "cerebras-key",
      },
      options: { temperature: 0.75 },
      assertCapturedOptions(
        capturedOptions: Record<string, unknown> | undefined,
      ) {
        assert.equal(capturedOptions?.temperature, 0.42);
      },
      assertPayload(payload: Record<string, unknown>) {
        assertPayloadKnobs(payload, 0.42, DEFAULT_TOP_P);
      },
    },
    {
      env: {
        PI_ZAI_CUSTOM_TOP_P: "0.84",
        CEREBRAS_API_KEY: "cerebras-key",
      },
      options: { top_p: 0.5 },
      assertCapturedOptions(
        capturedOptions: Record<string, unknown> | undefined,
      ) {
        assert.equal(capturedOptions?.top_p, 0.5);
      },
      assertPayload(payload: Record<string, unknown>) {
        assertPayloadKnobs(payload, DEFAULT_TEMPERATURE, 0.84);
      },
    },
  ];

  for (const testCase of cases) {
    const { recorder, streamSimple } = createStreamRecorderWithEnv(
      testCase.env,
    );

    streamSimple(createTestModel(), { messages: [] }, testCase.options);

    const capturedOptions = recorder.getCapturedOptions();
    testCase.assertCapturedOptions(capturedOptions);
    testCase.assertPayload(await invokeCapturedOnPayload(capturedOptions));
  }
});

test("createZaiStreamSimple treats empty string env knob values as undefined", async () => {
  const emptyValueCases = [
    { PI_TEMPERATURE: "", CEREBRAS_API_KEY: "cerebras-key" },
    { PI_ZAI_CUSTOM_TOP_P: "", CEREBRAS_API_KEY: "cerebras-key" },
    { PI_ZAI_CUSTOM_CLEAR_THINKING: "", CEREBRAS_API_KEY: "cerebras-key" },
  ];

  for (const env of emptyValueCases) {
    const { recorder, streamSimple } = createStreamRecorderWithEnv(env);

    streamSimple(createTestModel(), { messages: [] }, {});

    const capturedOptions = recorder.getCapturedOptions();
    assert.equal(capturedOptions?.temperature, DEFAULT_TEMPERATURE);
    assertPayloadKnobs(await invokeCapturedOnPayload(capturedOptions));
  }
});
