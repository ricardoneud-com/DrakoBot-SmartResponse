const { execSync } = require('child_process');
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { SmartResponse } = require('./response');

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
