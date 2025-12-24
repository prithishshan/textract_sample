require('dotenv').config();
if (process.env.AWS_SESSION_TOKEN === '') {
    delete process.env.AWS_SESSION_TOKEN;
}
const express = require('express');
const multer = require('multer');
const {
    TextractClient,
    StartDocumentAnalysisCommand,
    GetDocumentAnalysisCommand
} = require("@aws-sdk/client-textract");
const { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } = require("@aws-sdk/client-s3");
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

const BUCKET_NAME = process.env.BUCKET_NAME || `textract-demo-bucket-${Date.now()}`;
const REGION = process.env.AWS_REGION || 'us-east-1';

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Credentials setup moved below logging

// Construct credentials only if Env Vars are provided
let credentials = undefined;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
    if (process.env.AWS_SESSION_TOKEN && process.env.AWS_SESSION_TOKEN.trim() !== '') {
        credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
    }
}

console.log('--- AWS Configuration ---');
console.log('Region:', REGION);
if (credentials) {
    console.log('Using credentials from Environment (.env)');
} else {
    console.log('Using Default Credential Provider Chain (~/.aws/credentials)');
}
console.log('-------------------------');

const textract = new TextractClient({ region: REGION, credentials });
const s3 = new S3Client({ region: REGION, credentials });

(async () => {
    try {
        console.log('Verifying AWS connection (ListBuckets)...');
        await s3.send(new (require("@aws-sdk/client-s3").ListBucketsCommand)({}));
        console.log('AWS Connection Verified: ListBuckets succeeded.');
    } catch (e) {
        console.error('Startup Connectivity Check Failed:', e.message);
    }
})();

async function ensureBucketExists() {
    try {
        await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            console.log(`Creating bucket ${BUCKET_NAME}...`);
            await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        }
    }
}

// Helper to poll for ANALYSIS completion (replaces waitForJobCompletion for text)
async function waitForAnalysisCompletion(jobId) {
    let jobStatus = 'IN_PROGRESS';
    let response;

    while (jobStatus === 'IN_PROGRESS') {
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await textract.send(new GetDocumentAnalysisCommand({ JobId: jobId }));
        jobStatus = response.JobStatus;
    }
    console.log('\nAnalysis Job finished with status:', jobStatus);

    if (jobStatus === 'SUCCEEDED') {
        return response;
    } else {
        throw new Error(`Textract analysis failed with status: ${jobStatus}`);
    }
}

// Fetch all pages of ANALYSIS results
async function getAllAnalysisResults(jobId, initialResponse) {
    let blocks = initialResponse.Blocks || [];
    let nextToken = initialResponse.NextToken;

    while (nextToken) {
        console.log('Fetching next page of results...');
        const response = await textract.send(new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken
        }));
        blocks = blocks.concat(response.Blocks || []);
        nextToken = response.NextToken;
    }

    return blocks;
}


// --- Helper Function for Textract Processing ---
async function processFileWithTextract(filePath, originalName) {
    const fileKey = `uploads/${Date.now()}-${originalName}`;
    let currentStep = 'INIT';

    try {
        currentStep = 'ENSURE_BUCKET';
        console.log('[1/4] Ensuring Bucket Exists...');
        await ensureBucketExists();
        console.log('[1/4] Bucket OK.');

        currentStep = 'UPLOAD_S3';
        console.log('[2/4] Uploading to S3...');
        const fileBuffer = fs.readFileSync(filePath);
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Body: fileBuffer
        }));
        console.log('[2/4] Upload OK.');

        currentStep = 'START_TEXTRACT';
        console.log('[3/4] Starting Textract Analysis (FORMS)...');
        const startCommand = new StartDocumentAnalysisCommand({
            DocumentLocation: {
                S3Object: {
                    Bucket: BUCKET_NAME,
                    Name: fileKey
                }
            },
            FeatureTypes: ["FORMS"]
        });
        const startResponse = await textract.send(startCommand);

        currentStep = 'POLL_RESULTS';
        const jobId = startResponse.JobId;
        console.log(`[3/4] Job Started: ${jobId}`);

        console.log('[4/4] Polling for results...');
        const completedResponse = await waitForAnalysisCompletion(jobId);
        const allBlocks = await getAllAnalysisResults(jobId, completedResponse);
        console.log(`[4/4] Done. Blocks: ${allBlocks.length}`);

        return allBlocks;
    } catch (error) {
        throw { step: currentStep, error };
    }
}

// --- Endpoints ---

// 1. New Endpoint: Returns Raw Blocks
app.post('/analyze-blocks', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const filePath = req.file.path;

    try {
        const allBlocks = await processFileWithTextract(filePath, req.file.originalname);
        res.json({ Blocks: allBlocks });
    } catch (err) {
        console.error("!!! PROCESSING ERROR (/analyze-blocks) !!!", err);
        res.status(500).json({
            error: 'Processing failed',
            details: err.error?.message || err.message,
            failedStep: err.step
        });
    } finally {
        fs.unlink(filePath, () => { });
    }
});

// 2. Refined Endpoint: Returns only Structured Data (with Booleans)
app.post('/analyze', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded.');
    const filePath = req.file.path;

    try {
        const allBlocks = await processFileWithTextract(filePath, req.file.originalname);

        // --- Parsing Logic with Boolean Support ---
        const blockMap = {};
        allBlocks.forEach(b => blockMap[b.Id] = b);

        const getTextOrBool = (block, includeSelection = true) => {
            if (!block.Relationships) return '';

            // NEW LOGIC: If there is exactly ONE selection element, return its boolean status.
            // This handles cases where Textract accidentally includes label text (e.g. "(Less...") in the value block.
            const allChildren = block.Relationships
                .filter(r => r.Type === 'CHILD')
                .flatMap(r => r.Ids)
                .map(id => blockMap[id]);

            const selectionChildren = allChildren.filter(c => c.BlockType === 'SELECTION_ELEMENT');

            if (includeSelection && selectionChildren.length === 1) {
                return selectionChildren[0].SelectionStatus === 'SELECTED';
            }

            let text = '';
            block.Relationships.forEach(rel => {
                if (rel.Type === 'CHILD') {
                    rel.Ids.forEach(childId => {
                        const child = blockMap[childId];
                        if (child.BlockType === 'WORD') {
                            text += child.Text + ' ';
                        } else if (includeSelection && child.BlockType === 'SELECTION_ELEMENT') {
                            // Keep string representation for mixed content or multiple boxes
                            text += child.SelectionStatus === 'SELECTED' ? '[X] ' : '[ ] ';
                        }
                    });
                }
            });
            return text.trim();
        };

        const getSelectionStatusFromBlock = (block) => {
            if (!block.Relationships) return null;
            let status = null;
            block.Relationships.forEach(rel => {
                if (rel.Type === 'CHILD') {
                    rel.Ids.forEach(childId => {
                        const child = blockMap[childId];
                        if (child.BlockType === 'SELECTION_ELEMENT') {
                            status = child.SelectionStatus === 'SELECTED'; // Return boolean
                        }
                    });
                }
            });
            return status;
        };

        const structuredData = {};
        let keys = allBlocks.filter(b => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes.includes('KEY'));

        keys.sort((a, b) => {
            if ((a.Page || 1) !== (b.Page || 1)) return (a.Page || 1) - (b.Page || 1);
            if (Math.abs(a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top) > 0.005) {
                return a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top;
            }
            return a.Geometry.BoundingBox.Left - b.Geometry.BoundingBox.Left;
        });

        keys.forEach(keyBlock => {
            const keyText = getTextOrBool(keyBlock, false)
                .replace(/:$/, '')
                .replace(/^[X]\s+/i, '')
                .replace(/^\[ ?[xX]? ?\]\s+/, '');

            let val = null;
            const valueRel = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
            if (valueRel) {
                const valueBlock = blockMap[valueRel.Ids[0]];
                val = getTextOrBool(valueBlock, true);
            }

            if (val === null || val === '') {
                const keySelection = getSelectionStatusFromBlock(keyBlock);
                if (keySelection !== null) {
                    val = keySelection;
                }
            }

            if (val === null) val = '';

            if (Object.prototype.hasOwnProperty.call(structuredData, keyText)) {
                const existing = structuredData[keyText];
                if (Array.isArray(existing)) {
                    if (!existing.includes(val)) {
                        structuredData[keyText].push(val);
                    }
                } else if (existing !== val) {
                    structuredData[keyText] = [existing, val];
                }
            } else {
                structuredData[keyText] = val;
            }
        });

        // --- Schema Normalization ---
        const { findBestMatch } = require('./schemaMatcher');
        const schema = require('./generated_schema.json');
        const validKeys = Object.keys(schema.properties);

        const normalizedData = {};

        Object.keys(structuredData).forEach(extractedKey => {
            const bestMatch = findBestMatch(extractedKey, validKeys);

            if (bestMatch) {
                normalizedData[bestMatch] = structuredData[extractedKey];
            } else {
                normalizedData[extractedKey] = structuredData[extractedKey];
            }
        });

        res.json({
            StructuredData: normalizedData
        });

    } catch (err) {
        console.error("!!! PROCESSING ERROR (/analyze) !!!", err);
        res.status(500).json({
            error: 'Processing failed',
            details: err.error?.message || err.message,
            failedStep: err.step
        });
    } finally {
        fs.unlink(filePath, () => { });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
