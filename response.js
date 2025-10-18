const { execSync } = require('child_process');

function ensureModule(moduleName) {
    try {
        require.resolve(moduleName);
    } catch (e) {
        console.log(`${moduleName} not found. Installing...`);
        try {
            execSync(`npm install ${moduleName}`, { stdio: 'inherit' });
            console.log(`${moduleName} installed successfully.`);
        } catch (installError) {
            console.error(`Failed to install ${moduleName}:`, installError);
            process.exit(1);
        }
    }
}

const modules = [
    'natural',
    'fs',
    'path',
    'js-yaml',
    'discord.js',
    '@ai-sdk/openai',
    '@ai-sdk/groq',
    '@ai-sdk/mistral',
    'ai'
];

modules.forEach(ensureModule);

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const natural = require('natural');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGroq } = require('@ai-sdk/groq');
const { createMistral } = require('@ai-sdk/mistral');
const { generateText } = require('ai');

const conversationCache = new Map();

class SmartResponse {
    constructor(config) {
        this.config = config.SmartResponses;
        this.internalData = new Map();
        this.tokenizer = new natural.WordTokenizer();
        this.tfidf = new natural.TfIdf();
        this.stemmer = natural.PorterStemmer;
        this.stringSimilarity = natural.JaroWinklerDistance;
    }

    async initialize() {
        try {
            await fs.mkdir('./resources', { recursive: true });
        } catch (error) {
            console.log('Resources directory already exists or couldn\'t be created');
        }

        const directories = [
            './resources/docs',
            './resources/wiki',
            './resources/knowledge_base'
        ];

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                console.log(`Directory ${dir} already exists or couldn't be created`);
            }
        }

        await this.loadInternalData();
    }

    async loadInternalData() {
        for (const source of this.config.InternalDataSources) {
            try {
                const files = await this.recursiveReadDir(source);
                for (const file of files) {
                    const content = await fs.readFile(file, 'utf8');
                    this.internalData.set(file, content);
                }
            } catch (error) {
                console.error(`Error loading internal data from ${source}:`, error);
            }
        }
    }

    async recursiveReadDir(dir) {
        const files = [];
        const items = await fs.readdir(dir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
                const subFiles = await this.recursiveReadDir(fullPath);
                files.push(...subFiles);
            } else {
                files.push(fullPath);
            }
        }
        return files;
    }

    async processMessage(message) {
        if (!message || !message.content || message.author?.bot) {
            return null;
        }

        const cleanContent = this.cleanMessageContent(message);
        const phrase = this.findMatchingPhrase(cleanContent);

        if (!phrase) {
            return null;
        }

        if (phrase.Type === 'TEXT') {
            return {
                type: 'TEXT',
                content: phrase.Response
            };
        } else if (phrase.Type === 'EMBED') {
            return {
                type: 'EMBED',
                embed: phrase.Embed
            };
        } else if (phrase.Type === 'SMART') {
            return await this.generateAIResponse(message, phrase);
        }

        return null;
    }

    async generateAIResponse(message, phrase) {
        const provider = this.config.AIProvider || 'openai';

        switch (provider.toLowerCase()) {
            case 'openai':
                return this.generateOpenAIResponse(message, phrase);
            case 'groq':
                return this.generateGroqResponse(message, phrase);
            case 'mistral':
                return this.generateMistralResponse(message, phrase);
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }
    }

    async generateOpenAIResponse(message, phrase) {
        try {
            const profilePath = path.join(__dirname, 'resources', 'profile.md');
            const personalityProfile = await fs.readFile(profilePath, 'utf8');
            const relevantDocs = await this.findRelevantInternalData(message.content);
            const instance = createOpenAI({
               apiKey: this.config.Providers.OpenAI.APIKey
            });

            const systemInstructions = `${this.config.SystemPrompt}\n\n` +
                `Here is your personality profile and core knowledge:\n${personalityProfile}\n\n` +
                `When providing multi-step guidance:\n` +
                `1. Break your response into clear, numbered steps\n` +
                `[STEP_1] First step content here...\n` +
                `[STEP_2] Second step content here...\n` +
                `And so on...\n` +
                `3. Each step should be self-contained and clear\n` +
                `4. Keep each step concise but informative\n` +
                `5. If your response requires multiple steps, include [HAS_NEXT_STEPS] at the start\n`;

            const messages = [
                {
                    role: 'system',
                    content: systemInstructions
                }
            ];

            if (relevantDocs.length > 0) {
                messages.push({
                    role: 'system',
                    content: 'Here is some relevant internal documentation to help with this query:\n\n' +
                            relevantDocs.join('\n---\n')
                });
            }

            messages.push({
                role: 'user',
                content: message.content
            });

            const model = instance(this.config.Providers.OpenAI.Model);

            const { text: content } = await generateText({
                model,
                messages,
                temperature: this.config.Providers.OpenAI.Temperature,
                maxTokens: this.config.Providers.OpenAI.MaxTokens,
                providerOptions: {
                    openai: {
                        apiKey: this.config.Providers.OpenAI.APIKey
                    }
                }
            });

            const steps = this.parseSteps(content);

            if (steps.length > 1) {
                conversationCache.set(message.channel.id + message.author.id, {
                    steps: steps,
                    currentStep: 0,
                    timestamp: Date.now(),
                    originalQuery: message.content
                });

                return {
                    type: 'TEXT',
                    content: steps[0],
                    hasNextSteps: true
                };
            }

            return {
                type: 'TEXT',
                content: steps[0],
                hasNextSteps: false
            };
        } catch (error) {
            console.error('OpenAI API Error:', error);
            return {
                type: 'TEXT',
                content: 'I apologize, but I encountered an error processing your request.',
                hasNextSteps: false
            };
        }
    }

    async generateGroqResponse(message, phrase) {
        try {
            const profilePath = path.join(__dirname, 'resources', 'profile.md');
            const personalityProfile = await fs.readFile(profilePath, 'utf8');
            const relevantDocs = await this.findRelevantInternalData(message.content);
            const instance = createGroq({
               apiKey: this.config.Providers.Groq.APIKey
            });

            const systemInstructions = `${this.config.SystemPrompt}\n\n` +
                `Here is your personality profile and core knowledge:\n${personalityProfile}\n\n` +
                `When providing multi-step guidance:\n` +
                `1. Break your response into clear, numbered steps\n` +
                `[STEP_1] First step content here...\n` +
                `[STEP_2] Second step content here...\n` +
                `And so on...\n` +
                `3. Each step should be self-contained and clear\n` +
                `4. Keep each step concise but informative\n` +
                `5. If your response requires multiple steps, include [HAS_NEXT_STEPS] at the start\n`;

            const messages = [
                {
                    role: 'system',
                    content: systemInstructions
                }
            ];

            if (relevantDocs.length > 0) {
                messages.push({
                    role: 'system',
                    content: 'Here is some relevant internal documentation to help with this query:\n\n' +
                            relevantDocs.join('\n---\n')
                });
            }

            messages.push({
                role: 'user',
                content: message.content
            });

            const model = instance(this.config.Providers.Groq.Model);

            const { text: content } = await generateText({
                model,
                messages,
                temperature: this.config.Providers.Groq.Temperature,
                maxTokens: this.config.Providers.Groq.MaxTokens,
            });

            const steps = this.parseSteps(content);

            if (steps.length > 1) {
                conversationCache.set(message.channel.id + message.author.id, {
                    steps: steps,
                    currentStep: 0,
                    timestamp: Date.now(),
                    originalQuery: message.content
                });

                return {
                    type: 'TEXT',
                    content: steps[0],
                    hasNextSteps: true
                };
            }

            return {
                type: 'TEXT',
                content: steps[0],
                hasNextSteps: false
            };
        } catch (error) {
            console.error('Groq API Error:', error);
            return {
                type: 'TEXT',
                content: 'I apologize, but I encountered an error processing your request.',
                hasNextSteps: false
            };
        }
    }

    async generateMistralResponse(message, phrase) {
        try {
            const profilePath = path.join(__dirname, 'resources', 'profile.md');
            const personalityProfile = await fs.readFile(profilePath, 'utf8');
            const relevantDocs = await this.findRelevantInternalData(message.content);
            const instance = createMistral({
               apiKey: this.config.Providers.Mistral.APIKey
            });

            const systemInstructions = `${this.config.SystemPrompt}\n\n` +
                `Here is your personality profile and core knowledge:\n${personalityProfile}\n\n` +
                `When providing multi-step guidance:\n` +
                `1. Break your response into clear, numbered steps\n` +
                `[STEP_1] First step content here...\n` +
                `[STEP_2] Second step content here...\n` +
                `And so on...\n` +
                `3. Each step should be self-contained and clear\n` +
                `4. Keep each step concise but informative\n` +
                `5. If your response requires multiple steps, include [HAS_NEXT_STEPS] at the start\n`;

            const messages = [
                {
                    role: 'system',
                    content: systemInstructions
                }
            ];

            if (relevantDocs.length > 0) {
                messages.push({
                    role: 'system',
                    content: 'Here is some relevant internal documentation to help with this query:\n\n' +
                            relevantDocs.join('\n---\n')
                });
            }

            messages.push({
                role: 'user',
                content: message.content
            });

            const model = instance(this.config.Providers.Mistral.Model);

            const { text: content } = await generateText({
                model,
                messages,
                temperature: this.config.Providers.Mistral.Temperature,
                maxTokens: this.config.Providers.Mistral.MaxTokens,
                providerOptions: {
                    mistral: {
                        apiKey: this.config.Providers.Mistral.APIKey
                    }
                }
            });

            const steps = this.parseSteps(content);

            if (steps.length > 1) {
                conversationCache.set(message.channel.id + message.author.id, {
                    steps: steps,
                    currentStep: 0,
                    timestamp: Date.now(),
                    originalQuery: message.content
                });

                return {
                    type: 'TEXT',
                    content: steps[0],
                    hasNextSteps: true
                };
            }

            return {
                type: 'TEXT',
                content: steps[0],
                hasNextSteps: false
            };
        } catch (error) {
            console.error('Mistral API Error:', error);
            return {
                type: 'TEXT',
                content: 'I apologize, but I encountered an error processing your request.',
                hasNextSteps: false
            };
        }
    }

    isAllowedChannel(message) {
        const globalChannels = this.config.Triggers.WhitelistedChannels;
        const globalCategories = this.config.Triggers.WhitelistedCategories;

        if (globalChannels.length === 0 && globalCategories.length === 0) {
            return true;
        }

        if (globalChannels.includes(message.channel.id)) {
            return true;
        }

        if (message.channel.parent && globalCategories.includes(message.channel.parent.id)) {
            return true;
        }

        return false;
    }

    isPhraseAllowedInChannel(phrase, message) {
        if (!phrase.Channels && !phrase.Categories) {
            return true;
        }

        if (phrase.Channels && phrase.Channels.length > 0) {
            if (phrase.Channels.includes(message.channel.id)) {
                return true;
            }
        }

        if (phrase.Categories && phrase.Categories.length > 0) {
            if (message.channel.parent && phrase.Categories.includes(message.channel.parent.id)) {
                return true;
            }
        }

        return false;
    }

    isMentionValid(message) {
        const globalRequireMention = this.config.Triggers.RequireMention;

        if (!globalRequireMention) {
            return true;
        }

        const botMention = `<@${message.client.user.id}>`;
        const botNickMention = `<@!${message.client.user.id}>`;

        return message.content.includes(botMention) || message.content.includes(botNickMention);
    }

    cleanMessageContent(message) {
        let content = message.content;
        const botId = message.client.user.id;
        const mentionRegex = new RegExp(`<@!?${botId}>`, 'g');
        content = content.replace(mentionRegex, '');
        content = content.replace(/\s+/g, ' ').trim().toLowerCase();
        return content;
    }

    parseSteps(content) {
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

    async findRelevantInternalData(query) {
        const relevantDocs = [];
        const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(word => word.length > 3));

        for (const [file, content] of this.internalData.entries()) {
            const contentWords = new Set(content.toLowerCase().split(/\s+/));
            const matchingWords = [...queryWords].filter(word =>
                [...contentWords].some(contentWord => contentWord.includes(word))
            );

            const relevanceScore = matchingWords.length / queryWords.size;

            if (relevanceScore > 0.3) {
                relevantDocs.push(content);
            }
        }

        return relevantDocs.slice(0, 3);
    }

    findMatchingPhrase(message) {
        const messageTokens = this.tokenizer.tokenize(message.toLowerCase());
        let bestMatch = null;
        let highestScore = 0;

        for (const [key, phraseConfig] of Object.entries(this.config.Phrases)) {
            for (const phrase of phraseConfig.Phrase) {
                const phraseTokens = this.tokenizer.tokenize(phrase.toLowerCase());
                const isDirectMatch = this.isExactPhraseMatch(message, phrase);
                const exactMatchScore = this.stringSimilarity(message.toLowerCase(), phrase.toLowerCase());
                const stemmedScore = this.calculateStemmedSimilarity(messageTokens, phraseTokens);
                const semanticScore = this.calculateSemanticSimilarity(messageTokens, phraseTokens);
                let totalScore = (exactMatchScore * 0.5) + (stemmedScore * 0.3) + (semanticScore * 0.2);

                if (isDirectMatch) {
                    totalScore = Math.max(totalScore, phraseConfig.MatchPercent);
                }

                if (totalScore >= phraseConfig.MatchPercent && totalScore > highestScore) {
                    highestScore = totalScore;
                    bestMatch = phraseConfig;
                }
            }
        }

        return bestMatch;
    }

    calculateStemmedSimilarity(tokens1, tokens2) {
        const stemmed1 = tokens1.map(token => this.stemmer.stem(token));
        const stemmed2 = tokens2.map(token => this.stemmer.stem(token));
        const commonStems = stemmed1.filter(stem => stemmed2.includes(stem));

        if (commonStems.length > 0) {
            return Math.min(1, (2.0 * commonStems.length) / (stemmed1.length + stemmed2.length) + 0.1);
        }

        return (2.0 * commonStems.length) / (stemmed1.length + stemmed2.length);
    }

    calculateSemanticSimilarity(tokens1, tokens2) {
        this.tfidf.addDocument(tokens1.join(' '));
        this.tfidf.addDocument(tokens2.join(' '));
        let similarity = 0;

        this.tfidf.tfidfs(tokens1.join(' '), function(i, measure) {
            if (i === 1) {
                similarity = measure;
            }
        });

        return Math.min(1, Math.max(0, similarity / 10));
    }

    isExactPhraseMatch(message, phrase) {
        const messageWords = new Set(message.toLowerCase().split(/\s+/));
        const phraseWords = new Set(phrase.toLowerCase().split(/\s+/));
        const matchedWords = [...phraseWords].filter(word => messageWords.has(word));
        const matchRatio = matchedWords.length / phraseWords.size;
        return matchRatio >= 0.8;
    }

    splitMessage(content, maxLength = 2000) {
        const messages = [];
        let currentMessage = '';
        const paragraphs = content.split('\n\n');

        for (const paragraph of paragraphs) {
            if ((currentMessage + '\n\n' + paragraph).length > maxLength) {
                if (currentMessage) {
                    messages.push(currentMessage);
                    currentMessage = '';
                }

                if (paragraph.length > maxLength) {
                    const lines = paragraph.split('\n');

                    for (const line of lines) {
                        if ((currentMessage + '\n' + line).length > maxLength) {
                            if (currentMessage) {
                                messages.push(currentMessage);
                                currentMessage = '';
                            }

                            if (line.length > maxLength) {
                                const words = line.split(' ');

                                for (const word of words) {
                                    if ((currentMessage + ' ' + word).length > maxLength) {
                                        messages.push(currentMessage);
                                        currentMessage = word;
                                    } else {
                                        currentMessage += (currentMessage ? ' ' : '') + word;
                                    }
                                }
                            } else {
                                currentMessage = line;
                            }
                        } else {
                            currentMessage += (currentMessage ? '\n' : '') + line;
                        }
                    }
                } else {
                    currentMessage = paragraph;
                }
            } else {
                currentMessage += (currentMessage ? '\n\n' : '') + paragraph;
            }
        }

        if (currentMessage) {
            messages.push(currentMessage);
        }

        return messages;
    }

    createNextStepsButton() {
        const button = new ButtonBuilder()
            .setCustomId('next_step')
            .setLabel('Show Next Step')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️');

        return new ActionRowBuilder().addComponents(button);
    }

    async handleStepProgression(interaction) {
        const cacheKey = interaction.channel.id + interaction.user.id;
        const conversationState = conversationCache.get(cacheKey);

        if (!conversationState) {
            return {
                content: "I'm sorry, but I couldn't find the context of our conversation. Could you please ask your question again?",
                hasMoreSteps: false
            };
        }

        if (Date.now() - conversationState.timestamp > 30 * 60 * 1000) {
            conversationCache.delete(cacheKey);

            return {
                content: "I apologize, but our conversation has timed out. Could you please ask your question again?",
                hasMoreSteps: false
            };
        }

        conversationState.currentStep++;
        conversationState.timestamp = Date.now();
        const hasMoreSteps = conversationState.currentStep < conversationState.steps.length - 1;

        if (!hasMoreSteps) {
            conversationCache.delete(cacheKey);
        }

        return {
            content: conversationState.steps[conversationState.currentStep],
            hasMoreSteps
        };
    }

    cleanupOldConversations() {
        const thirtyMinutes = 30 * 60 * 1000;

        for (const [key, value] of conversationCache.entries()) {
            if (Date.now() - value.timestamp > thirtyMinutes) {
                conversationCache.delete(key);
            }
        }
    }

    createMessageButtons(hasNextSteps) {
        const row = new ActionRowBuilder();

        if (hasNextSteps) {
            const nextButton = new ButtonBuilder()
                .setCustomId('next_step')
                .setLabel('Show Next Step')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➡️');

            row.addComponents(nextButton);
        }

        const askButton = new ButtonBuilder()
            .setCustomId('ask_question')
            .setLabel('Ask Another Question')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❓');

        row.addComponents(askButton);

        return row;
    }

    createQuestionModal() {
        const modal = new ModalBuilder()
            .setCustomId('question_modal')
            .setTitle('Ask DrakoBot a Question');

        const questionInput = new TextInputBuilder()
            .setCustomId('question_input')
            .setLabel('What would you like to know?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Type your question here...')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000);

        const actionRow = new ActionRowBuilder().addComponents(questionInput);
        modal.addComponents(actionRow);

        return modal;
    }
}

let smartResponseInstance = null;

module.exports.run = async (client) => {
    try {
        const configPath = path.join(__dirname, 'config.yml');
        const configFile = fsSync.readFileSync(configPath, 'utf8');
        const config = yaml.load(configFile);

        smartResponseInstance = new SmartResponse(config);
        await smartResponseInstance.initialize();
    } catch (error) {
        console.error('Failed to initialize SmartResponse:', error);
        return;
    }

    setInterval(() => {
        if (smartResponseInstance) {
            smartResponseInstance.cleanupOldConversations();
        }
    }, 5 * 60 * 1000);

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            if (interaction.customId === 'next_step') {
                await interaction.deferUpdate();

                try {
                    const response = await smartResponseInstance.handleStepProgression(interaction);
                    const messageOptions = {
                        content: response.content,
                        components: [smartResponseInstance.createMessageButtons(response.hasMoreSteps)]
                    };

                    await interaction.followUp(messageOptions);
                } catch (error) {
                    console.error('Error handling button interaction:', error);
                    await interaction.followUp({
                        content: 'Sorry, I encountered an error processing the next step.',
                        ephemeral: true
                    });
                }
            } else if (interaction.customId === 'ask_question') {
                try {
                    const modal = smartResponseInstance.createQuestionModal();
                    await interaction.showModal(modal);
                } catch (error) {
                    console.error('Error showing question modal:', error);
                    await interaction.reply({
                        content: 'Sorry, I encountered an error opening the question form.',
                        ephemeral: true
                    });
                }
            }
        } else if (interaction.isModalSubmit() && interaction.customId === 'question_modal') {
            try {
                const question = interaction.fields.getTextInputValue('question_input');
                await interaction.deferReply();

                const response = await smartResponseInstance.processMessage({
                    content: question,
                    author: interaction.user,
                    channel: interaction.channel,
                    client: interaction.client,
                    reply: interaction.followUp.bind(interaction)
                });

                if (!response) {
                    await interaction.followUp('I apologize, but I couldn\'t process your question. Please try rephrasing it.');
                    return;
                }

                if (response.type === 'TEXT') {
                    const messages = smartResponseInstance.splitMessage(response.content);

                    for (const [index, msg] of messages.entries()) {
                        const messageOptions = {
                            content: msg,
                            components: index === messages.length - 1 ?
                                [smartResponseInstance.createMessageButtons(response.hasNextSteps)] :
                                []
                        };

                        await interaction.followUp(messageOptions);
                    }
                } else if (response.type === 'EMBED') {
                    await interaction.followUp({
                        embeds: [response.embed],
                        components: [smartResponseInstance.createMessageButtons(false)]
                    });
                }
            } catch (error) {
                console.error('Error handling modal submit:', error);
                await interaction.followUp({
                    content: 'Sorry, I encountered an error processing your question.',
                    ephemeral: true
                });
            }
        }
    });

    client.on('messageCreate', async (message) => {
        try {
            if (!smartResponseInstance.isAllowedChannel(message) ||
                !smartResponseInstance.isMentionValid(message)) {
                return;
            }

            if (!message.author.bot) {
                try {
                    await message.react('⏳');
                } catch (error) {
                    console.error('Failed to add reaction:', error);
                }
            }

            const response = await smartResponseInstance.processMessage(message);

            if (!message.author.bot) {
                try {
                    const userReactions = message.reactions.cache.filter(reaction =>
                        reaction.users.cache.has(client.user.id)
                    );

                    for (const reaction of userReactions.values()) {
                        await reaction.users.remove(client.user.id);
                    }
                } catch (error) {
                    console.error('Failed to remove reaction:', error);
                }
            }

            if (!response) return;

            if (response.type === 'TEXT') {
                const messages = smartResponseInstance.splitMessage(response.content);

                for (const [index, msg] of messages.entries()) {
                    const messageOptions = {
                        content: msg,
                        components: index === messages.length - 1 ?
                            [smartResponseInstance.createMessageButtons(response.hasNextSteps)] :
                            []
                    };

                    await message.reply(messageOptions);
                }
            } else if (response.type === 'EMBED') {
                await message.reply({
                    embeds: [response.embed],
                    components: [smartResponseInstance.createMessageButtons(false)]
                });
            }

            if (!message.author.bot) {
                try {
                    await message.react('✅');
                } catch (error) {
                    console.error('Failed to add completion reaction:', error);
                }
            }
        } catch (error) {
            console.error('Error in SmartResponse messageCreate handler:', error);

            if (!message.author.bot) {
                try {
                    await message.react('❌');
                } catch (reactionError) {
                    console.error('Failed to add error reaction:', reactionError);
                }
            }
        }
    });
};

module.exports.SmartResponse = SmartResponse;
