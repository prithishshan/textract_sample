# AWS Textract PDF Form Parser Demo

This application demonstrates how to use AWS Textract's `AnalyzeDocument` API (FORMS feature) to parse PDF forms, extract structured Key-Value pairs (including checkboxes), and display them in an Angular frontend.

## Technology Stack

*   **Frontend**: Angular 21+ (Standalone Components), TypeScript, CSS (Flexbox/Grid).
*   **Backend**: Node.js, Express.js.
*   **AWS Services**:
    *   **Amazon Textract**: Specifically the `StartDocumentAnalysis` API with `FeatureTypes: ["FORMS"]` for structured data extraction.
    *   **Amazon S3**: For temporary storage of documents required by the asynchronous Textract API.
*   **Libraries**:
    *   `@aws-sdk/client-textract`: For interacting with Textract.
    *   `@aws-sdk/client-s3`: For uploading files to S3.
    *   `multer`: For handling file uploads in Express.

## Architecture & Workflow

The application follows a standard asynchronous processing flow to handle potentially multi-page PDF documents:

1.  **File Upload**:
    *   The user selects a PDF in the Angular frontend.
    *   The file is sent to the Node.js backend via the `/analyze` endpoint using `FormData`.

2.  **S3 Staging**:
    *   The backend uploads the received file to a designated **Amazon S3 Bucket**.
    *   This step is necessary because the asynchronous `StartDocumentAnalysis` API requires the input document to be in an S3 bucket (it cannot accept raw bytes for large files).

3.  **Textract Analysis Job**:
    *   The backend initiates a Textract job using `StartDocumentAnalysisCommand`.
    *   **Key Configuration**: `FeatureTypes: ["FORMS"]` is enabled. This tells Textract to specifically look for key-value pairs (e.g., "Name: John Doe") and selection elements (checkboxes).

4.  **Polling Validation**:
    *   The backend polls the `GetDocumentAnalysisCommand` API every 1 second to check the Job Status.
    *   Once the status changes to `SUCCEEDED`, the backend retrieves all result pages (handling pagination/NextToken).

5.  **Data Parsing & Structured Output**:
    *   The raw Textract JSON response consists of thousands of "Blocks" (`PAGE`, `LINE`, `WORD`, `KEY_VALUE_SET`, `SELECTION_ELEMENT`).
    *   **Data Parsing & Schema Validation**:
        *   **Fuzzy Matching**: extracted keys are compared against a canonical `generated_schema.json` using Levenshtein distance. This corrects OCR typos (e.g. `Sentenc Date` -> `Sentence Date`) and ensures consistent JSON keys.
        *   **Boolean Extraction**: The parser specifically detects fields that contain checkboxes (Selection Elements). Even if a field contains mixed text (e.g., `[ ] (Less than...)`), the logic extracts the boolean state (`true`/`false`) while ignoring the noise.
        *   **Pruning**: Extraneous page elements (Footers, Page numbers) defined in the schema are automatically filtered out.
    *   **Schema Enforcement**: `generated_schema.json` acts as a strict contract, defining not just the keys but the *types* (e.g., `boolean` for checkboxes). This ensures the frontend receives predictable, type-safe data.

6.  **Response**:
    *   The backend returns a unified JSON object containing both the raw `Blocks` (for the visual overlay) and the cleaned `StructuredData` (for the form table).
    *   The Angular UI renders the text overlay on the PDF and populates the data table.

## Deployment & Configuration

### Prerequisites
1.  **Node.js**: v24+ installed.
2.  **AWS Account**: Active account with permissions to manage Textract and S3.

### AWS Configuration
1.  **IAM Permissions**: Ensure your user has `AmazonTextractFullAccess` and `AmazonS3FullAccess`.
2.  **S3 Bucket**: Create a bucket (e.g., `textract-demo-bucket`) in your region (e.g., `us-east-1`).

### Environment Variables
Create a `.env` file in the **root** folder (`textract_sample/.env`):

```env
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
BUCKET_NAME=your_existing_s3_bucket_name
```

## Running the Application

### Terminal 1: Backend
```bash
cd textract_sample
npm install
node server.js
```
*   Server starts on **port 3001**.

### Terminal 2: Frontend
```bash
cd textract_sample/textract-demo
npm install
ng serve
```
*   Access the app at `http://localhost:4200`.
