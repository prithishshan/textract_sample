const fs = require('fs');

const data = JSON.parse(fs.readFileSync('form_output.json', 'utf8'));
const blocks = data.Blocks;
const blockMap = {};
blocks.forEach(b => blockMap[b.Id] = b);

function getText(block) {
    if (!block.Relationships) return '';
    let text = '';
    block.Relationships.forEach(rel => {
        if (rel.Type === 'CHILD') {
            rel.Ids.forEach(childId => {
                const child = blockMap[childId];
                if (child.BlockType === 'WORD') {
                    text += child.Text + ' ';
                } else if (child.BlockType === 'SELECTION_ELEMENT') {
                    text += `[${child.SelectionStatus}] `;
                }
            });
        }
    });
    return text.trim();
}

const keys = blocks.filter(b => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes.includes('KEY'));

console.log('--- FORM KEYS FOUND ---');
keys.forEach(keyBlock => {
    const keyText = getText(keyBlock);

    // Find Value
    let valText = '[NO VALUE]';
    const valueRel = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
    if (valueRel) {
        const valueBlock = blockMap[valueRel.Ids[0]];
        valText = getText(valueBlock);
    }

    console.log(`Key: "${keyText}" | Value: "${valText}"`);
});
