const openai = require('./openai');
const groq = require('./groq');
const mistral = require('./mistral');
const googlegenerative = require('./googlegenerative');
const togetherai = require('./togetherai');

async function generateAIResponse(smartResponse, message, phrase) {
    try {
        const provider = smartResponse?.config?.AIProvider || 'openai';
        if (!provider) {
            console.error('[ERROR] No AI provider specified in configuration. Falling back to default: openai');
        } else {
            console.log(`[INFO] Using AI provider: ${provider}`);
        }

        switch (provider.toLowerCase()) {
            case 'openai':
                return openai.generateResponse(smartResponse, message, phrase);
            case 'groq':
                return groq.generateResponse(smartResponse, message, phrase);
            case 'mistral':
                return mistral.generateResponse(smartResponse, message, phrase);
            case 'googlegenerative':
                return googlegenerative.generateResponse(smartResponse, message, phrase);
            case 'togetherai':
                return togetherai.generateResponse(smartResponse, message, phrase);
            default:
                console.error(`[ERROR] Unsupported AI provider specified: ${provider}`);
                return {
                    type: 'TEXT',
                    content: `Configuration error: Unsupported AI provider "${provider}". Please verify your settings.`,
                    hasNextSteps: false
                };
        }
    } catch (error) {
        console.error('[FATAL] Unexpected error in generateAIResponse function:', error);
        return {
            type: 'TEXT',
            content: 'I apologize, but an internal error occurred while selecting the AI provider.',
            hasNextSteps: false
        };
    }
}

module.exports = { generateAIResponse };
