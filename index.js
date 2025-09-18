#!/usr/bin/env node

const API_KEY = process.env.DIAMANT_API_KEY;
if (!API_KEY) {
    console.warn('Warning: API_KEY is not set in environment. Set it in a .env file or your shell.');
}

const url = 'https://api.perplexity.ai/chat/completions';
const headers = {
        'Authorization': `Bearer ${API_KEY || 'YOUR_API_KEY'}`,
        'Content-Type': 'application/json'
};

const question = process.argv[2] || "";

const payload = {
        model: 'sonar-pro',
        messages: [
                { role: 'user', content: question }
        ]
};

(async function main() {
    try {

      const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // console.log(data); 
        console.log('💎 ' + data.choices[0].message.content); 

    } catch (err) {
        console.error('Request failed:', err);
        process.exitCode = 1;
    }
})();