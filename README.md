# Custom Provider: ZAI

A custom provider extension for the ZAI/Cerebras AI API, providing access to the GLM-4.7 model with specialized reasoning support.

## Features

- **GLM-4.7 Model**: High-performance model with 204K context window and up to 131K max tokens
- **Reasoning Support**: Built-in thinking format support for transparent reasoning
- **Flexible Configuration**: Configure sampling parameters via environment variables or options
- **Cost Tracking**: Detailed token and cost metrics (cache read/write supported)

## Configuration

### Environment Variables

| Variable                       | Description                                   | Default                    |
|--------------------------------|-----------------------------------------------|----------------------------|
| `PI_ZAI_API_KEY`               | Explicit API key for ZAI provider             | -                          |
| `ZAI_API_KEY`                  | ZAI-specific API key                          | -                          |
| `CEREBRAS_API_KEY`             | Cerebras API key (fallback)                   | -                          |
| `PI_TEMPERATURE`               | Generic temperature (shared across providers) | -                          |
| `PI_ZAI_CUSTOM_TOP_P`          | Top-p sampling parameter                      | 0.95                       |
| `PI_ZAI_CUSTOM_CLEAR_THINKING` | Clear thinking output                         | false                      |
| `PI_ZAI_CUSTOM_BASE_URL`       | Custom base URL                               | https://api.cerebras.ai/v1 |

### Runtime Options

When invoking the provider, you can pass these options:

- `temperature`: Sampling temperature (0.0-2.0)
- `top_p` / `topP`: Nucleus sampling parameter
- `clear_thinking` / `clearThinking`: Whether to clear thinking output

## Usage

The provider is automatically registered as `zai-custom`. To use it:

```bash
# Set your API key
export ZAI_API_KEY="your-api-key"

# Or use Cerebras
export CEREBRAS_API_KEY="your-cerebras-key"

# Use the provider with custom knobs
PI_ZAI_CUSTOM_TOP_P=0.8 PI_ZAI_CUSTOM_CLEAR_THINKING=true pi
```

## Model Details

**GLM-4.7** (`zai-glm-4.7`):
- Context Window: 204,800 tokens
- Max Output: 131,072 tokens
- Input Cost: $0.60 / 1M tokens
- Output Cost: $2.20 / 1M tokens
- Cache Read: $0.11 / 1M tokens
