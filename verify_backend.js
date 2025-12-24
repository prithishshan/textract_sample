const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // You might need to install axios or use http

async function testBackend() {
    // The previously copied form
    const filePath = path.join(__dirname, 'target_form.pdf');

    if (!fs.existsSync(filePath)) {
        console.error("target_form.pdf not found! Did you copy it?");
        return;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        console.log('Uploading target_form.pdf to http://localhost:3001/analyze ...');
        const response = await axios.post('http://localhost:3001/analyze', form, {
            headers: {
                ...form.getHeaders()
            },
            maxBodyLength: Infinity
        });

        console.log('Response Status:', response.status);
        console.log('Blocks received:', response.data.Blocks.length);

        fs.writeFileSync('form_output.json', JSON.stringify(response.data, null, 2));
        console.log('Saved output to form_output.json');

    } catch (error) {
        console.error('Error testing backend:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testBackend();
