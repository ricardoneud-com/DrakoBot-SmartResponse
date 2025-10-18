const openai = require('./openai');
const groq = require('./groq');
const mistral = require('./mistral');

async function generateAIResponse(smartResponse, message, phrase) {
    const provider = smartResponse.config.AIProvider || 'openai';
    switch (provider.toLowerCase()) {
        case 'openai':
            return openai.generateResponse(smartResponse, message, phrase);
        case 'groq':
            return groq.generateResponse(smartResponse, message, phrase);
        case 'mistral':
            return mistral.generateResponse(smartResponse, message, phrase);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

module.exports = { generateAIResponse };
