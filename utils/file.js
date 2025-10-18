const fs = require('fs').promises;
const path = require('path');

async function ensureDirectories() {
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
}

async function recursiveReadDir(dir) {
    const files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            const subFiles = await recursiveReadDir(fullPath);
            files.push(...subFiles);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

module.exports = { ensureDirectories, recursiveReadDir };
