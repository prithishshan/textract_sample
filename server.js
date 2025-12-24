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

app.post('/analyze', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = req.file.path;
    const fileKey = `uploads/${Date.now()}-${req.file.originalname}`;

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
            FeatureTypes: ["FORMS"] // Enable Form extraction
        });
        const startResponse = await textract.send(startCommand);

        currentStep = 'POLL_RESULTS';
        const jobId = startResponse.JobId;
        console.log(`[3/4] Job Started: ${jobId}`);

        console.log('[4/4] Polling for results...');
        const completedResponse = await waitForAnalysisCompletion(jobId);
        const allBlocks = await getAllAnalysisResults(jobId, completedResponse);
        console.log(`[4/4] Done. Blocks: ${allBlocks.length}`);

        // --- Parsing Logic ---
        const blockMap = {};
        allBlocks.forEach(b => blockMap[b.Id] = b);

        const getText = (block, includeSelection = true) => {
            if (!block.Relationships) return '';
            let text = '';
            block.Relationships.forEach(rel => {
                if (rel.Type === 'CHILD') {
                    rel.Ids.forEach(childId => {
                        const child = blockMap[childId];
                        if (child.BlockType === 'WORD') {
                            text += child.Text + ' ';
                        } else if (includeSelection && child.BlockType === 'SELECTION_ELEMENT') {
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
                            status = child.SelectionStatus === 'SELECTED' ? '[X]' : '[ ]';
                        }
                    });
                }
            });
            return status;
        };

        const structuredData = {};
        let keys = allBlocks.filter(b => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes.includes('KEY'));

        // Sort keys by Page, then Top, then Left
        keys.sort((a, b) => {
            if ((a.Page || 1) !== (b.Page || 1)) return (a.Page || 1) - (b.Page || 1);
            if (Math.abs(a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top) > 0.005) { // 0.5 tolerance
                return a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top;
            }
            return a.Geometry.BoundingBox.Left - b.Geometry.BoundingBox.Left;
        });

        keys.forEach(keyBlock => {
            // Get Key Text EXCLUDING selection elements (to keep key clean)
            // Also strip leading "X" words (OCR artifacts) or "[]" text
            const keyText = getText(keyBlock, false)
                .replace(/:$/, '')
                .replace(/^[X]\s+/i, '') // Remove leading "X " (often misread checked box)
                .replace(/^\[ ?[xX]? ?\]\s+/, ''); // Remove literal "[ ]", "[x]", "[X]" text

            let valText = null;
            const valueRel = keyBlock.Relationships?.find(r => r.Type === 'VALUE');
            if (valueRel) {
                const valueBlock = blockMap[valueRel.Ids[0]];
                valText = getText(valueBlock, true);
            }

            // Fallback: If Value is empty/missing, check if the Key itself contains a selection
            // (Common in checkboxes where the box is grouped with the label)
            if (!valText) {
                const keySelection = getSelectionStatusFromBlock(keyBlock);
                if (keySelection) {
                    valText = keySelection;
                }
            }

            // Normalize empty value
            if (valText === null) valText = '';

            if (Object.prototype.hasOwnProperty.call(structuredData, keyText)) {
                const existing = structuredData[keyText];
                if (Array.isArray(existing)) {
                    if (!existing.includes(valText)) {
                        structuredData[keyText].push(valText);
                    }
                } else if (existing !== valText) {
                    structuredData[keyText] = [existing, valText];
                }
            } else {
                structuredData[keyText] = valText;
            }
        });
        // ---------------------

        res.json({
            Blocks: allBlocks,
            StructuredData: structuredData
        });

    } catch (error) {
        console.error("!!! PROCESSING ERROR !!!");
        console.error("Failed at step:", currentStep);
        res.status(500).json({
            error: 'Processing failed',
            details: error.message,
            failedStep: currentStep,
            errorName: error.name
        });
    } finally {
        fs.unlink(filePath, () => { });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
