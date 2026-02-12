# Custom Provider: ZAI

A custom provider extension that exposes ZAI-family models from two upstream hosts:

- **Cerebras-hosted models** (requires `CEREBRAS_API_KEY`)
- **ZAI-hosted models** (requires `ZAI_API_KEY`)

Model availability is determined strictly by which provider API keys are present.

## Features

- **Key-based model availability**
  - `CEREBRAS_API_KEY` => Cerebras model set
  - `ZAI_API_KEY` => ZAI model set
  - Both keys => both model sets
- **Model-driven endpoint routing**
  - `zai-custom/<model-id>` is enough to choose the right base URL and API key
- **Reasoning + sampling knobs**
  - Supports `temperature`, `top_p`, and `clear_thinking`

## Configuration

### Environment Variables

| Variable                       | Description                                              | Default |
|--------------------------------|----------------------------------------------------------|---------|
| `CEREBRAS_API_KEY`             | Required for Cerebras-hosted models                      | -       |
| `ZAI_API_KEY`                  | Required for ZAI-hosted models                           | -       |
| `PI_TEMPERATURE`               | Generic temperature (shared across providers)            | 0.9     |
| `PI_ZAI_CUSTOM_TOP_P`          | Top-p sampling parameter                                 | 0.95    |
| `PI_ZAI_CUSTOM_CLEAR_THINKING` | Clear thinking output                                    | false   |

> `PI_ZAI_API_KEY` and base URL overrides are intentionally unsupported.

### Runtime Options

When invoking the provider, you can pass these options:

- `temperature`: Sampling temperature (0.0-2.0)
- `top_p` / `topP`: Nucleus sampling parameter
- `clear_thinking` / `clearThinking`: Whether to clear thinking output

## Usage

The provider is registered as `zai-custom`.

```bash
# Cerebras-hosted models only
export CEREBRAS_API_KEY="your-cerebras-key"

# ZAI-hosted models only
export ZAI_API_KEY="your-zai-key"

# Both model sets
export CEREBRAS_API_KEY="your-cerebras-key"
export ZAI_API_KEY="your-zai-key"
```

## Model Matrix

### Cerebras-hosted

**GLM-4.7 Cerebras** (`zai-glm-4.7`)
- Endpoint: `https://api.cerebras.ai/v1`
- Context Window: 204,800 tokens
- Max Output: 131,072 tokens
- Input Cost: $0.60 / 1M tokens
- Output Cost: $2.20 / 1M tokens
- Cache Read: $0.11 / 1M tokens

### ZAI-hosted

**GLM 4.7 ZAI** (`glm-4.7`)
- Endpoint: `https://api.z.ai/api/coding/paas/v4`
- Context Window: 204,800 tokens
- Max Output: 131,072 tokens
- Input Cost: $0.60 / 1M tokens
- Output Cost: $2.20 / 1M tokens
- Cache Read: $0.11 / 1M tokens

**GLM-5 (ZAI)** (`glm-5`)
- Endpoint: `https://api.z.ai/api/coding/paas/v4`
- Context Window: 200,000 tokens
- Max Output: 128,000 tokens
- Input Cost: $0.15 / 1M tokens
- Output Cost: $0.60 / 1M tokens
- Cache Read: $0.00 / 1M tokens
