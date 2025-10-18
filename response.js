const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const natural = require('natural');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { generateText } = require('ai');
const conversationCache = new Map();
const providers = require('./providers');
const utils = require('./utils');

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
        await utils.file.ensureDirectories();
        await this.loadInternalData();
    }

    async loadInternalData() {
        for (const source of this.config.InternalDataSources) {
            try {
                const files = await utils.file.recursiveReadDir(source);
                for (const file of files) {
                    const content = await fs.readFile(file, 'utf8');
                    this.internalData.set(file, content);
                }
            } catch (error) {
                console.error(`Error loading internal data from ${source}:`, error);
            }
        }
    }

    async processMessage(message) {
        if (!message || !message.content || message.author?.bot) {
            return null;
        }
        const cleanContent = utils.text.cleanMessageContent(message);
        const phrase = this.findMatchingPhrase(cleanContent);
        if (!phrase) {
            return null;
        }
        if (phrase.Type === 'TEXT') {
            return { type: 'TEXT', content: phrase.Response };
        } else if (phrase.Type === 'EMBED') {
            return { type: 'EMBED', embed: phrase.Embed };
        } else if (phrase.Type === 'SMART') {
            return providers.generateAIResponse(this, message, phrase);
        }
        return null;
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

    findMatchingPhrase(message) {
        const messageTokens = this.tokenizer.tokenize(message.toLowerCase());
        let bestMatch = null;
        let highestScore = 0;
        for (const [key, phraseConfig] of Object.entries(this.config.Phrases)) {
            for (const phrase of phraseConfig.Phrase) {
                const phraseTokens = this.tokenizer.tokenize(phrase.toLowerCase());
                const isDirectMatch = utils.text.isExactPhraseMatch(message, phrase);
                const exactMatchScore = this.stringSimilarity(message.toLowerCase(), phrase.toLowerCase());
                const stemmedScore = utils.text.calculateStemmedSimilarity(this.stemmer, messageTokens, phraseTokens);
                const semanticScore = utils.text.calculateSemanticSimilarity(this.tfidf, messageTokens, phraseTokens);
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
        return utils.ui.createMessageButtons(hasNextSteps);
    }

    createQuestionModal() {
        return utils.ui.createQuestionModal();
    }

    splitMessage(content, maxLength = 2000) {
        return utils.text.splitMessage(content, maxLength);
    }
}

module.exports = { SmartResponse, conversationCache };
