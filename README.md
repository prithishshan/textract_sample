# AWS Textract PDF Form Parser Demo

This application demonstrates how to use AWS Textract's `AnalyzeDocument` API (FORMS feature) to parse PDF forms, extract structured Key-Value pairs (including checkboxes), and display them in an Angular frontend.

## Prerequisites

1.  **Node.js**: v14+ installed.
2.  **AWS Account**: You need an active AWS account.
3.  **AWS IAM User**: An IAM user with programmatic access (Access Key ID and Secret Access Key).

## AWS Configuration

### 1. IAM Permissions
Ensure your IAM user has the following permissions:
*   `AmazonTextractFullAccess` (or `textract:AnalyzeDocument`, `textract:GetDocumentAnalysis`)
*   `AmazonS3FullAccess` (or read/write access to the specific bucket you will use)

### 2. S3 Bucket
Create an S3 bucket (e.g., `textract-demo-bucket`) in your preferred region (e.g., `us-east-1`).
*   This bucket is used to temporarily store PDFs for processing by Textract.
*   **Note**: The application is configured to use a persistent bucket name defined in your `.env` file to avoid creating new buckets repeatedly.

## Setup

### 1. Clone/Download
Ensure you have the project files locally.

### 2. Backend Setup
Navigate to the root directory (`textract_sample`) and install dependencies:
```bash
cd textract_sample
npm install
```

### 3. Frontend Setup
Navigate to the frontend directory (`textract-demo`) and install dependencies:
```bash
cd textract_sample/textract-demo
npm install
```

### 4. Environment Variables
Create a `.env` file in the **root** folder (`textract_sample/.env`) with your AWS credentials:

```env
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
BUCKET_NAME=your_existing_s3_bucket_name
```

*   Replace `your_access_key_id` and `your_secret_access_key` with your IAM credentials.
*   Set `AWS_REGION` to the region where your bucket and Textract service are located (e.g., `us-east-1`).
*   Set `BUCKET_NAME` to the name of the S3 bucket you created.

## Running the Application

You need to run the backend and frontend in separate terminals.

### Terminal 1: Backend API
```bash
cd textract_sample
node server.js
```
*   The server will start on **port 3001**.
*   It will verify your AWS connection on startup only if a file processing request occurs or you can inspect the logs.

### Terminal 2: Frontend UI
```bash
cd textract_sample/textract-demo
ng serve
```
*   The Angular development server will start on **port 4200**.

## Usage

1.  Open your browser to `http://localhost:4200`.
2.  Click **Choose File** and select a PDF form.
3.  The text overlay will appear on the left.
4.  Switch to the **Form Data** tab on the right to see the extracted fields, values, and checkbox statuses.
