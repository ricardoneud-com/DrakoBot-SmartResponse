# SmartResponse Addon - Drako Bot

## Features
- **Automatic installation** of required Node.js modules
- **Multi-provider AI support** via [Vercel AI SDK](https://sdk.vercel.ai/docs/providers) (OpenAI, Groq, Mistral)
- **Multi-step response handling** with interactive Discord buttons
- **Internal knowledge base search** for context-aware responses
- **Semantic and stemmed similarity** for advanced message matching
- **Discord modal and button interactions** for user-friendly input
- **Conversation cache** with automatic timeout management
- **Modular architecture** for easy maintenance and extensibility

> **Note:** The bot automatically installs missing modules on first run.

## Project Structure
```
.
├── response.js          # Main SmartResponse class
├── providers/           # AI provider integrations
│   ├── openai.js        # OpenAI provider logic
│   ├── groq.js          # Groq provider logic
│   ├── mistral.js       # Mistral provider logic
│   └── index.js         # Exports all providers
├── utils/               # Utility functions
│   ├── file.js          # File/directory utilities
│   ├── text.js          # Text processing utilities
│   ├── ui.js            # UI component utilities
│   └── index.js         # Exports all utilities
├── resources/           # Internal knowledge base
│   ├── docs/            # Documentation files
│   ├── wiki/             # Wiki articles
│   ├── knowledge_base/  # Structured knowledge
│   └── profile.md       # Bot personality profile
├── config.yml           # Configuration file
└── index.js             # Entry point (Discord bot integration)
```

## Configuration
The main configuration file is `config.yml`. Key sections:

### **SmartResponses**
Define bot-specific settings, such as:
- `SystemPrompt`: Default instructions for AI responses.
- `InternalDataSources`: Paths to internal knowledge base folders.
- `Triggers`: Channel/categories whitelist and mention requirements.

### **AI Providers**
Configure your AI provider keys and models:
```yaml
AIProvider: 'openai'  # Default provider

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
Define message triggers and responses:
```yaml
Phrases:
  Greeting:
    Phrase: ["hello", "hi", "hey"]
    Type: TEXT
    Response: "Hello! How can I help you today?"
    MatchPercent: 0.8
```

### **Triggers**
Control where the bot responds:
```yaml
Triggers:
  WhitelistedChannels: ["channel-id-1", "channel-id-2"]
  WhitelistedCategories: ["category-id-1"]
  RequireMention: true
```

## Adding New AI Providers
The modular structure makes it easy to add new AI providers:

### **Steps**
1. **Install the provider SDK** (if required):
   ```bash
   npm install @ai-sdk/<provider>
   ```
2. **Create a provider file** in `providers/` (e.g., `anthropic.js`).
3. **Implement the provider logic** (see existing files for reference):
   ```javascript
   const { createAnthropic } = require('@ai-sdk/anthropic');
   const { generateText } = require('ai');

   async function generateResponse(smartResponse, message, phrase) {
     // Implement provider-specific logic
   }

   module.exports = { generateResponse };
   ```
4. **Update `providers/index.js`** to include the new provider:
   ```javascript
   const anthropic = require('./anthropic');
   ```
5. **Add a new case** in `SmartResponse.generateAIResponse`:
   ```javascript
   case 'anthropic':
     return anthropic.generateResponse(this, message, phrase);
   ```
6. **Configure the provider** in `config.yml`:
   ```yaml
   Anthropic:
     APIKey: 'your-anthropic-api-key'
     Model: 'claude-3-opus-20240229'
     Temperature: 0.7
     MaxTokens: 1024
   ```

## Usage
### **Bot Interaction**
- The bot listens to messages in allowed channels/categories.
- Use **mentions** (if `RequireMention: true`) to trigger responses.
- **Multi-step responses** are managed via Discord buttons:
  - `Show Next Step`: Proceed to the next step.
  - `Ask Another Question`: Open a modal for new queries.

### **Internal Knowledge Base**
- Place documents in `resources/docs/`, `resources/wiki/`, or `resources/knowledge_base/`.
- The bot automatically loads and indexes these files for context-aware responses.

## Automatic Module Management
The bot checks for required Node.js modules at runtime. If a module is missing:
1. It logs the missing module.
2. Installs it automatically using `npm install`.
3. Continues execution after installation.

**Auto-installed modules:**
```
natural, fs, path, js-yaml, discord.js,
@ai-sdk/openai, @ai-sdk/groq, @ai-sdk/mistral, ai
```

## Credits
- **John** – Owner of **Drako Bot** and original creator of **SmartResponse**.
- **SmartResponse Extensions** – Added support for multiple AI providers via Vercel AI SDK.
