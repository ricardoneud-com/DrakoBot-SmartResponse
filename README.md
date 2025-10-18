# SmartResponse Addon - Drako Bot

## Features

- Automatic installation of required Node.js modules
- Multi-provider AI support via [Vercel AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers)
- Multi-step response handling
- Internal knowledge base search
- Semantic and stemmed similarity for message matching
- Discord modal and button interactions
- Conversation cache with timeout management

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd <repository-folder>
````

2. Install Node.js dependencies:

```bash
npm install
```

> The bot automatically installs any missing modules on first run.

3. Configure your `config.yml` with your AI provider keys and bot settings.

## Configuration

The main configuration file is `config.yml`. Key sections include:

* `SmartResponses`: Bot-specific settings

* `AIProvider`: Default provider (`openai`, `groq`, `mistral`, etc.)

* `Providers` (Vercel AI SDK based):

  ```yaml
  OpenAI:
    APIKey: 'your-openai-api-key'
    Model: 'gpt-4'
    Temperature: 0.7
    MaxTokens: 1024

  Groq:
    APIKey: 'your-groq-api-key'
    Model: 'groq-model-name'
    Temperature: 0.7
    MaxTokens: 1024

  Mistral:
    APIKey: 'your-mistral-api-key'
    Model: 'mistral-model-name'
    Temperature: 0.7
    MaxTokens: 1024
  ```

* `Phrases`: Define triggers and responses

* `Triggers`: Control which channels or categories the bot can respond in, and whether mention is required

## Adding New AI Providers

With the Vercel AI SDK, you can integrate a large variety of AI providers easily:

1. Install the provider SDK if necessary.
2. Create a wrapper function similar to `createOpenAI`, `createGroq`, or `createMistral`.
3. Add a new branch in `SmartResponse.generateAIResponse` to handle your provider:

```javascript
case 'myprovider':
  return this.generateMyProviderResponse(message, phrase);
```

4. Implement `generateMyProviderResponse` with proper request handling and multi-step parsing.
5. Update `config.yml` with API key and model configuration for the new provider.

> The bot automatically installs any missing dependencies using the `ensureModule` function at runtime.

## Usage

* The bot listens to messages and responds if the channel is allowed and mention rules are satisfied.
* Multi-step responses are managed via interactive Discord buttons (`Show Next Step`) and modals (`Ask Another Question`).
* Internal knowledge base documents are automatically loaded from the `resources` folder.

## Automatic Module Management

SmartResponse automatically checks for required Node.js modules. If any module is missing, it will:

1. Log the missing module.
2. Install the module using `npm install`.
3. Continue execution once installed.

Supported auto-installed modules include:

```text
natural, fs, path, js-yaml, discord.js, @ai-sdk/openai, @ai-sdk/groq, @ai-sdk/mistral, ai
```

## Credits

* **John** – Owner of **Drako Bot** and the official creator of both **Drako Bot** and **SmartResponse**
* **SmartResponse Extensions** – Added support for multiple AI providers (Groq, Mistral, OpenAI) via Vercel AI SDK
