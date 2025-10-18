const { createTogetherAI } = require('@ai-sdk/togetherai');
const { generateText } = require('ai');
const fs = require('fs').promises;
const path = require('path');

async function generateResponse(smartResponse, message, phrase) {
    try {
        const profilePath = path.join(__dirname, '../resources', 'profile.md');
        const personalityProfile = await fs.readFile(profilePath, 'utf8');
        const relevantDocs = await smartResponse.findRelevantInternalData(message.content);
        const instance = createTogetherAI({ apiKey: smartResponse.config.Providers.TogetherAI.APIKey });
        const systemInstructions = `${smartResponse.config.SystemPrompt}\n\nHere is your personality profile and core knowledge:\n${personalityProfile}\n\nWhen providing multi-step guidance:\n1. Break your response into clear, numbered steps\n[STEP_1] First step content here...\n[STEP_2] Second step content here...\nAnd so on...\n3. Each step should be self-contained and clear\n4. Keep each step concise but informative\n5. If your response requires multiple steps, include [HAS_NEXT_STEPS] at the start\n`;
        const messages = [{ role: 'system', content: systemInstructions }];
        if (relevantDocs.length > 0) {
            messages.push({ role: 'system', content: 'Here is some relevant internal documentation to help with this query:\n\n' + relevantDocs.join('\n---\n') });
        }
        messages.push({ role: 'user', content: message.content });
        const model = instance(smartResponse.config.Providers.TogetherAI.Model);
        const { text: content } = await generateText({
            model,
            messages
        });
        const steps = parseSteps(content);
        if (steps.length > 1) {
            smartResponse.conversationCache.set(message.channel.id + message.author.id, {
                steps: steps,
                currentStep: 0,
                timestamp: Date.now(),
                originalQuery: message.content
            });
            return { type: 'TEXT', content: steps[0], hasNextSteps: true };
        }
        return { type: 'TEXT', content: steps[0], hasNextSteps: false };
    } catch (error) {
        console.error('OpenAI API Error:', error);
        return { type: 'TEXT', content: 'I apologize, but I encountered an error processing your request.', hasNextSteps: false };
    }
}

function parseSteps(content) {
    const steps = [];
    const stepRegex = /\[STEP_(\d+)\]([\s\S]*?)(?=\[STEP_\d+\]|$)/g;
    let match;
    while ((match = stepRegex.exec(content)) !== null) {
        steps[parseInt(match[1]) - 1] = match[2].trim();
    }
    if (steps.length === 0 && content.includes('[HAS_NEXT_STEPS]')) {
        const cleanContent = content.replace('[HAS_NEXT_STEPS]', '').trim();
        const parts = cleanContent.split('\n\n');
        if (parts.length > 1) {
            steps.push(...parts);
        } else {
            steps.push(cleanContent);
        }
    } else if (steps.length === 0) {
        steps.push(content.trim());
    }
    return steps;
}

module.exports = { generateResponse };
