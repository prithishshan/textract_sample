const fs = require('fs');

function parseForm(jsonPath) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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
                        text += child.SelectionStatus === 'SELECTED' ? '[X] ' : '[ ] ';
                    }
                });
            }
        });
        return text.trim();
    }

    const output = {};
    const keys = blocks.filter(b => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes.includes('KEY'));

    keys.forEach(keyBlock => {
        const keyText = getText(keyBlock).replace(/:$/, ''); // Remove trailing colon

        let valText = null;
        const valueRel = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
        if (valueRel) {
            const valueBlock = blockMap[valueRel.Ids[0]];
            valText = getText(valueBlock);
        }

        // Handle repeated keys or just overwrite? For now, overwrite or append.
        if (output[keyText]) {
            if (Array.isArray(output[keyText])) {
                output[keyText].push(valText);
            } else {
                output[keyText] = [output[keyText], valText];
            }
        } else {
            output[keyText] = valText;
        }
    });

    return output;
}

if (require.main === module) {
    const result = parseForm('form_output.json');
    console.log(JSON.stringify(result, null, 2));

    // Generate simple JSON Schema
    const schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Generated Form Schema",
        "type": "object",
        "properties": {},
        "required": [] // Assume all optional for now
    };

    Object.keys(result).forEach(k => {
        schema.properties[k] = { "type": ["string", "null"] };
    });

    fs.writeFileSync('generated_schema.json', JSON.stringify(schema, null, 2));
    console.log('\n--- SCHEMA GENERATED: generated_schema.json ---');
}

module.exports = { parseForm };
