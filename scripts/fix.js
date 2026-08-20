const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../content/microservices.md');
const content = fs.readFileSync(filePath, 'utf-8');

const blocks = content.split(/\n---\n+/);
const header = blocks.shift(); // The first block is the title

const categorized = {
    Beginner: [],
    Intermediate: [],
    Advanced: [],
    Scenario: []
};

let footer = '';

for (const block of blocks) {
    if (block.includes('*End of guide — Q1–Q17')) {
        footer = block;
        continue;
    }
    
    const match = block.match(/## (Beginner|Intermediate|Advanced|Scenario) — Question \d+/);
    if (match) {
        categorized[match[1]].push(block);
    } else {
        if (block.trim().length > 0) {
            console.log("Unmatched block:", block.substring(0, 50));
        }
    }
}

// Re-number and build the final content
let result = header + '\n\n';

for (const level of ['Beginner', 'Intermediate', 'Advanced', 'Scenario']) {
    const list = categorized[level];
    for (let i = 0; i < list.length; i++) {
        let block = list[i];
        block = block.replace(/## (Beginner|Intermediate|Advanced|Scenario) — Question \d+/, `## ${level} — Question ${i + 1}`);
        block = block.replace(/\*\*Q\d+:/, `**Q${i + 1}:`);
        result += '---\n\n' + block + '\n\n';
    }
}

if (footer) {
    result += '---\n\n' + footer + '\n\n';
}

fs.writeFileSync(filePath, result.trim() + '\n');
console.log('Fixed microservices.md');
