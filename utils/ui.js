const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

function createMessageButtons(hasNextSteps) {
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

function createQuestionModal() {
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

module.exports = { createMessageButtons, createQuestionModal };
