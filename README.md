## Overview

The **SmartResponse Addon** for Drako Bot is a modular, AI-driven response system designed for Discord servers. It supports multiple AI providers, handles multi-step interactions, and integrates seamlessly with internal knowledge bases for context-aware responses. The system is built with extensibility in mind, allowing developers to add new AI providers or customize bot behavior without modifying core logic.

## Features

- **Automatic Node.js module management** Missing modules are detected and installed on first run.
- **Multi-provider AI support** via [Vercel AI SDK](https://sdk.vercel.ai/docs/providers) Supports OpenAI, Groq, Mistral, and easily extendable to other providers.
- **Multi-step response handling** with interactive Discord buttons.
- **Internal knowledge base integration** for enhanced context-aware replies.
- **Advanced message matching** using semantic similarity and stemmed matching.
- **Discord modal and button interactions** for user-friendly input.
- **Conversation caching** with automatic timeout management.
- **Modular and maintainable architecture** for easier future extensions.

> **Note:** Auto-installation occurs for missing modules, ensuring smooth first-time setup.

## Configuration

All bot settings are defined in `config.yml`.

### **SmartResponses**

Configure default AI behavior and internal data sources:

```yaml
SystemPrompt: "You are a helpful Discord assistant."
InternalDataSources:
  - "resources/docs"
  - "resources/wiki"
  - "resources/knowledge_base"
Triggers:
  WhitelistedChannels: ["channel-id-1", "channel-id-2"]
  WhitelistedCategories: ["category-id-1"]
  RequireMention: true
```

### **AI Providers**

Define API keys, models, and response settings:

```yaml
AIProvider: 'openai'

Providers:
  OpenAI:
    APIKey: 'your-openai-api-key'
    Model: 'gpt-4'
    Temperature: 0.7
    MaxTokens: 1024
  Groq:
    APIKey: 'your-groq-api-key'
    Model: 'llama3-70b-8192'
    Temperature: 0.7
    MaxTokens: 1024
  Mistral:
    APIKey: 'your-mistral-api-key'
    Model: 'mistral-large-latest'
    Temperature: 0.7
    MaxTokens: 1024
```

### **Phrases**

Define triggers and responses:

```yaml
Phrases:
  Greeting:
    Phrase: ["hello", "hi", "hey"]
    Type: TEXT
    Response: "Hello! How can I assist you today?"
    MatchPercent: 0.8
```

## Adding New AI Providers

The modular architecture makes it straightforward to add new AI providers. The following guide outlines the required steps.

### **Step 1: Install Provider SDK**

Install the official SDK for your AI provider:

```bash
npm install @ai-sdk/<provider-name>
```

### **Step 2: Create Provider Module**

Create a new file in `providers/`, e.g., `anthropic.js`:

```javascript
const { createAnthropic } = require('@ai-sdk/anthropic');
const { generateText } = require('ai');

async function generateResponse(smartResponse, message, phrase) {
  const providerConfig = smartResponse.config.Providers.Anthropic;
  const input = {
    model: providerConfig.Model,
    prompt: phrase || message.content,
    max_tokens: providerConfig.MaxTokens,
    temperature: providerConfig.Temperature
  };
  const response = await generateText(createAnthropic(providerConfig.APIKey), input);
  return response.text;
}

module.exports = { generateResponse };
```

### **Step 3: Update Providers Index**

Include the new provider in `providers/index.js`:

```javascript
const anthropic = require('./anthropic');

module.exports = {
  openai,
  groq,
  mistral,
  anthropic
};
```

### **Step 4: Update SmartResponse Logic**

Modify `SmartResponse.generateAIResponse` to handle the new provider:

```javascript
switch(this.config.AIProvider.toLowerCase()) {
  case 'openai':
    return openai.generateResponse(this, message, phrase);
  case 'groq':
    return groq.generateResponse(this, message, phrase);
  case 'mistral':
    return mistral.generateResponse(this, message, phrase);
  case 'anthropic':
    return anthropic.generateResponse(this, message, phrase);
  default:
    throw new Error(`AI provider ${this.config.AIProvider} not supported`);
}
```

### **Step 5: Configure Provider in YAML**

Add the new provider configuration in `config.yml`:

```yaml
Anthropic:
  APIKey: 'your-anthropic-api-key'
  Model: 'claude-3-opus-20240229'
  Temperature: 0.7
  MaxTokens: 1024
```

### **Step 6: Test Your Provider**

- Restart the bot and confirm the new provider works.
- Send a test message in a whitelisted channel.
- Ensure the AI responds as expected.

## Usage

### **Bot Interaction**

- The bot listens to messages in whitelisted channels and categories.
- If `RequireMention` is enabled, mention the bot to trigger a response.
- Multi-step responses use Discord buttons:
  - `Show Next Step`: Proceed to the next message in a sequence.
  - `Ask Another Question`: Opens a modal for new input.

### **Internal Knowledge Base**

- Place your reference documents in `resources/docs/`, `resources/wiki/`, or `resources/knowledge_base/`.
- The bot automatically indexes and retrieves context from these sources.

### **Conversation Cache**

- Responses are cached to improve performance.
- Cache timeout ensures memory is not consumed indefinitely.

## Automatic Module Management

The bot verifies required modules on runtime:

- Logs missing dependencies.
- Installs them automatically via `npm install`.
- Continues execution after installation.

**Auto-installed modules:**

```
natural, fs, path, js-yaml, discord.js,
@ai-sdk/openai, @ai-sdk/groq, @ai-sdk/mistral, @ai-sdk/google, @ai-sdk/togetherai, ai
```

## Credits

- **John** – Owner of **Drako Bot** and original creator of **SmartResponse**.
