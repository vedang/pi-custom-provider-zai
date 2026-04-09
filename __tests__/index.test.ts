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
    apiKey: "placeholder-key",
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

function invokeCapturedOnPayload(
  capturedOptions: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  (capturedOptions?.onPayload as ((payload: unknown) => void) | undefined)?.(
    payload,
  );
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

function assertModelProps(
  model: ZaiProviderConfig["models"][number],
  expected: {
    id: string;
    name: string;
    reasoning: boolean;
    baseUrl: string;
    apiKey: string;
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
  },
) {
  assert.equal(model.id, expected.id);
  assert.equal(model.name, expected.name);
  assert.equal(model.reasoning, expected.reasoning);
  assert.equal(model.baseUrl, expected.baseUrl);
  assert.equal(model.apiKey, expected.apiKey);
  assert.deepEqual(model.cost, expected.cost);
}

test("index extension registers zai-custom provider", () => {
  const source = readFileSync(indexPath, "utf-8");
  assert.match(source, /registerProvider\([\s\S]*"zai-custom"/);
});

test("buildZaiProviderConfig returns no models when no provider keys are configured", () => {
  const config = buildConfig();

  assert.equal(config.api, "openai-completions");
  assert.equal(config.baseUrl, CEREBRAS_BASE_URL);
  assert.equal(config.models.length, 0);
});

test("buildZaiProviderConfig registers Cerebras models when CEREBRAS_API_KEY is set", () => {
  const config = buildConfig({
    CEREBRAS_API_KEY: "cerebras-key",
  });

  assert.equal(config.models.length, 1);
  assert.equal(config.models[0].id, "zai-glm-4.7");
  assert.equal(config.models[0].name, "GLM-4.7 Cerebras");
  assert.equal(config.models[0].reasoning, false);
  assert.equal(config.models[0].baseUrl, CEREBRAS_BASE_URL);
  assert.equal(config.models[0].apiKey, "cerebras-key");
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

test("buildZaiProviderConfig registers ZAI models when ZAI_API_KEY is set", () => {
  const config = buildConfig({
    ZAI_API_KEY: "zai-key",
  });

  assert.equal(config.models.length, 4);
  assertModelProps(config.models[0], {
    id: "glm-4.7",
    name: "GLM 4.7 ZAI",
    reasoning: true,
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
    cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
  });
  assert.equal(config.models[1].id, "glm-5");
  assert.equal(config.models[1].baseUrl, ZAI_BASE_URL);
  assert.equal(config.models[2].id, "glm-5-turbo");
  assertModelProps(config.models[2], {
    id: "glm-5-turbo",
    name: "GLM-5 Turbo (ZAI)",
    reasoning: true,
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
    cost: { input: 1.2, output: 4.0, cacheRead: 0, cacheWrite: 0 },
  });
  assert.equal(config.models[3].id, "glm-5.1");
  assertModelProps(config.models[3], {
    id: "glm-5.1",
    name: "GLM-5.1 (ZAI)",
    reasoning: true,
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
    cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
  });
});

function assertHasModel(
  models: ZaiProviderConfig["models"],
  expected: {
    id: string;
    baseUrl: string;
    apiKey: string;
  },
) {
  assert.equal(
    models.some(
      (m) =>
        m.id === expected.id &&
        m.baseUrl === expected.baseUrl &&
        m.apiKey === expected.apiKey,
    ),
    true,
    `Expected to find model with id=${expected.id}`,
  );
}

test("buildZaiProviderConfig registers both model sets when both keys are set", () => {
  const config = buildConfig({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  assert.equal(config.models.length, 5);
  assertHasModel(config.models, {
    id: "zai-glm-4.7",
    baseUrl: CEREBRAS_BASE_URL,
    apiKey: "cerebras-key",
  });
  assertHasModel(config.models, {
    id: "glm-4.7",
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
  });
  assertHasModel(config.models, {
    id: "glm-5",
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
  });
  assertHasModel(config.models, {
    id: "glm-5-turbo",
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
  });
  assertHasModel(config.models, {
    id: "glm-5.1",
    baseUrl: ZAI_BASE_URL,
    apiKey: "zai-key",
  });
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

test("createZaiStreamSimple routes Cerebras model IDs to Cerebras endpoint and key", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(createTestModel("zai-glm-4.7"), { messages: [] }, {});

  const capturedModel = recorder.getCapturedModel();
  assert.equal(capturedModel?.baseUrl, CEREBRAS_BASE_URL);
  assert.equal(capturedModel?.apiKey, "cerebras-key");
});

test("createZaiStreamSimple routes ZAI model IDs to ZAI endpoint and key", () => {
  const { recorder, streamSimple } = createStreamRecorderWithEnv({
    CEREBRAS_API_KEY: "cerebras-key",
    ZAI_API_KEY: "zai-key",
  });

  streamSimple(createTestModel("glm-5.1"), { messages: [] }, {});

  const capturedModel = recorder.getCapturedModel();
  assert.equal(capturedModel?.baseUrl, ZAI_BASE_URL);
  assert.equal(capturedModel?.apiKey, "zai-key");
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
  assert.equal(capturedModel?.apiKey, "zai-key");
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
  assert.equal(capturedModel?.apiKey, "cerebras-key");
  assert.equal(capturedOptions?.apiKey, "cerebras-key");
});

test("createZaiStreamSimple enforces payload knobs while preserving caller onPayload", () => {
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

  const payload = invokeCapturedOnPayload(capturedOptions);

  assert.equal(callerOnPayloadSeen, true);
  assert.equal(payload.fromCaller, true);
  assertPayloadKnobs(payload, 0.42, 0.84, true);
});

test("createZaiStreamSimple ignores legacy env knob formats", () => {
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
    assertPayloadKnobs(invokeCapturedOnPayload(capturedOptions));
  }
});

test("createZaiStreamSimple env knobs override or preserve option behavior as expected", () => {
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
    testCase.assertPayload(invokeCapturedOnPayload(capturedOptions));
  }
});

test("createZaiStreamSimple treats empty string env knob values as undefined", () => {
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
    assertPayloadKnobs(invokeCapturedOnPayload(capturedOptions));
  }
});
