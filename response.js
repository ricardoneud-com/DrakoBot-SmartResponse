const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const natural = require('natural')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js')
const utils = require('./utils')
const providers = require('./providers')

const conversationCache = new Map()

class SmartResponse {
    constructor(config) {
        this.rootConfig = config
        this.config = config.SmartResponses
        this.internalData = new Map()
        this.tokenizer = new natural.WordTokenizer()
        this.tfidf = new natural.TfIdf()
        this.stemmer = natural.PorterStemmer
        this.stringSimilarity = natural.JaroWinklerDistance
        this.conversationCache = conversationCache
        console.log('[INFO] SmartResponse instance created.')
    }

    async initialize() {
        try {
            console.log('[INFO] Initializing SmartResponse...')
            await utils.file.ensureDirectories()
            await this.loadInternalData()
            console.log('[INFO] SmartResponse initialization complete.')
        } catch (error) {
            console.error('[ERROR] Initialization failed:', error)
        }
    }

    async loadInternalData() {
        for (const source of this.config.InternalDataSources) {
            try {
                const files = await utils.file.recursiveReadDir(source)
                for (const file of files) {
                    try {
                        const content = await fs.readFile(file, 'utf8')
                        this.internalData.set(file, content)
                    } catch (fileError) {
                        console.error(`[ERROR] Failed to read internal file ${file}:`, fileError)
                    }
                }
            } catch (error) {
                console.error(`[ERROR] Error loading internal data from ${source}:`, error)
            }
        }
    }

    isAllowedChannel(message) {
        try {
            const triggers = this.config.Triggers || {}
            const whitelistedChannels = triggers.WhitelistedChannels || []
            const whitelistedCategories = triggers.WhitelistedCategories || []

            if (whitelistedChannels.length === 0 && whitelistedCategories.length === 0) return true
            if (whitelistedChannels.includes(message.channel.id)) return true
            if (message.channel.parentId && whitelistedCategories.includes(message.channel.parentId)) return true

            return false
        } catch (error) {
            console.error('[ERROR] isAllowedChannel failed:', error)
            return true
        }
    }

    isMentionValid(message) {
        try {
            const triggers = this.config.Triggers || {}
            const requireMention = triggers.RequireMention ?? false
            if (!requireMention) return true

            const clientId = message.client?.user?.id
            if (!clientId) return false
            return message.mentions.users.has(clientId)
        } catch (error) {
            console.error('[ERROR] isMentionValid failed:', error)
            return false
        }
    }

    async processMessage(message) {
        try {
            if (!message || !message.content || message.author?.bot) return null
            const cleanContent = utils.text.cleanMessageContent(message)

            let phrase = this.findMatchingPhrase(cleanContent)

            if (phrase) {
                if (phrase.Type === 'TEXT') return { type: 'TEXT', content: phrase.Response }
                if (phrase.Type === 'EMBED') return { type: 'EMBED', embed: phrase.Embed }
                if (phrase.Type === 'SMART') return providers.generateAIResponse(this, message, phrase)
            }

            return providers.generateAIResponse(this, message, null)

        } catch (error) {
            console.error('[ERROR] processMessage failed:', error)
            return null
        }
    }

    findMatchingPhrase(message) {
        try {
            const messageTokens = this.tokenizer.tokenize(message.toLowerCase())
            let bestMatch = null
            let highestScore = 0

            for (const [key, phraseConfig] of Object.entries(this.config.Phrases || {})) {
                for (const phrase of phraseConfig.Phrase) {
                    const phraseTokens = this.tokenizer.tokenize(phrase.toLowerCase())
                    const isDirectMatch = utils.text.isExactPhraseMatch(message, phrase)
                    const exactMatchScore = this.stringSimilarity(message.toLowerCase(), phrase.toLowerCase())
                    const stemmedScore = utils.text.calculateStemmedSimilarity(this.stemmer, messageTokens, phraseTokens)
                    const semanticScore = utils.text.calculateSemanticSimilarity(this.tfidf, messageTokens, phraseTokens)
                    let totalScore = (exactMatchScore * 0.5) + (stemmedScore * 0.3) + (semanticScore * 0.2)

                    if (isDirectMatch) totalScore = Math.max(totalScore, phraseConfig.MatchPercent)

                    if (totalScore >= phraseConfig.MatchPercent && totalScore > highestScore) {
                        highestScore = totalScore
                        bestMatch = phraseConfig
                    }
                }
            }

            return bestMatch
        } catch (error) {
            console.error('[ERROR] findMatchingPhrase failed:', error)
            return null
        }
    }

    async findRelevantInternalData(query) {
        try {
            const relevantDocs = []
            const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(word => word.length > 3))

            for (const [file, content] of this.internalData.entries()) {
                const contentWords = new Set(content.toLowerCase().split(/\s+/))
                const matchingWords = [...queryWords].filter(word =>
                    [...contentWords].some(contentWord => contentWord.includes(word))
                )
                const relevanceScore = matchingWords.length / queryWords.size
                if (relevanceScore > 0.3) relevantDocs.push(content)
            }

            return relevantDocs.slice(0, 3)
        } catch (error) {
            console.error('[ERROR] findRelevantInternalData failed:', error)
            return []
        }
    }

    async handleStepProgression(interaction) {
        try {
            const cacheKey = interaction.channel.id + interaction.user.id
            const conversationState = conversationCache.get(cacheKey)
            if (!conversationState) return { content: "Couldn't find conversation context.", hasMoreSteps: false }

            if (Date.now() - conversationState.timestamp > 30 * 60 * 1000) {
                conversationCache.delete(cacheKey)
                return { content: "Conversation timed out.", hasMoreSteps: false }
            }

            conversationState.currentStep++
            conversationState.timestamp = Date.now()
            const hasMoreSteps = conversationState.currentStep < conversationState.steps.length - 1
            if (!hasMoreSteps) conversationCache.delete(cacheKey)

            return { content: conversationState.steps[conversationState.currentStep], hasMoreSteps }
        } catch (error) {
            console.error('[ERROR] handleStepProgression failed:', error)
            return { content: "An error occurred while progressing the conversation.", hasMoreSteps: false }
        }
    }

    cleanupOldConversations() {
        try {
            const thirtyMinutes = 30 * 60 * 1000
            for (const [key, value] of conversationCache.entries()) {
                if (Date.now() - value.timestamp > thirtyMinutes) conversationCache.delete(key)
            }
        } catch (error) {
            console.error('[ERROR] cleanupOldConversations failed:', error)
        }
    }

    createMessageButtons(hasNextSteps) {
        try {
            return utils.ui.createMessageButtons(hasNextSteps)
        } catch (error) {
            console.error('[ERROR] createMessageButtons failed:', error)
            return []
        }
    }

    createQuestionModal() {
        try {
            return utils.ui.createQuestionModal()
        } catch (error) {
            console.error('[ERROR] createQuestionModal failed:', error)
            return null
        }
    }

    splitMessage(content, maxLength = 2000) {
        try {
            return utils.text.splitMessage(content, maxLength)
        } catch (error) {
            console.error('[ERROR] splitMessage failed:', error)
            return [content]
        }
    }
}

module.exports = { SmartResponse, conversationCache }
