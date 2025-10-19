const openai = require('./openai');
const groq = require('./groq');
const mistral = require('./mistral');
const googlegenerative = require('./googlegenerative');
const togetherai = require('./togetherai');

async function generateAIResponse(smartResponse, message, phrase) {
    const provider = smartResponse.config.AIProvider || 'openai';
    switch (provider.toLowerCase()) {
        case 'openai':
            return openai.generateResponse(smartResponse, message, phrase);
        case 'groq':
            return groq.generateResponse(smartResponse, message, phrase);
        case 'mistral':
            return mistral.generateResponse(smartResponse, message, phrase);
        case 'googleGenerative':
            return googlegenerative.generateResponse(smartResponse, message, phrase);
        case 'togetherai':
            return togetherai.generateResponse(smartResponse, message, phrase);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

module.exports = { generateAIResponse };
