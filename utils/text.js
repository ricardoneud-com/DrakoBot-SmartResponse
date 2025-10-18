function cleanMessageContent(message) {
    let content = message.content;
    const botId = message.client.user.id;
    const mentionRegex = new RegExp(`<@!?${botId}>`, 'g');
    content = content.replace(mentionRegex, '');
    content = content.replace(/\s+/g, ' ').trim().toLowerCase();
    return content;
}

function isExactPhraseMatch(message, phrase) {
    const messageWords = new Set(message.toLowerCase().split(/\s+/));
    const phraseWords = new Set(phrase.toLowerCase().split(/\s+/));
    const matchedWords = [...phraseWords].filter(word => messageWords.has(word));
    const matchRatio = matchedWords.length / phraseWords.size;
    return matchRatio >= 0.8;
}

function calculateStemmedSimilarity(stemmer, tokens1, tokens2) {
    const stemmed1 = tokens1.map(token => stemmer.stem(token));
    const stemmed2 = tokens2.map(token => stemmer.stem(token));
    const commonStems = stemmed1.filter(stem => stemmed2.includes(stem));
    if (commonStems.length > 0) {
        return Math.min(1, (2.0 * commonStems.length) / (stemmed1.length + stemmed2.length) + 0.1);
    }
    return (2.0 * commonStems.length) / (stemmed1.length + stemmed2.length);
}

function calculateSemanticSimilarity(tfidf, tokens1, tokens2) {
    tfidf.addDocument(tokens1.join(' '));
    tfidf.addDocument(tokens2.join(' '));
    let similarity = 0;
    tfidf.tfidfs(tokens1.join(' '), function(i, measure) {
        if (i === 1) {
            similarity = measure;
        }
    });
    return Math.min(1, Math.max(0, similarity / 10));
}

function splitMessage(content, maxLength = 2000) {
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

module.exports = {
    cleanMessageContent,
    isExactPhraseMatch,
    calculateStemmedSimilarity,
    calculateSemanticSimilarity,
    splitMessage
};
