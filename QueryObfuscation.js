const readline = require('readline');
const axios = require('axios');
const OpenAI = require('openai');

// Store the OpenAI API key
const OPENAI_API_KEY = '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';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

// Store existing mappings (replace with actual mappings as needed)
const existingMappings = [
    { old: 'a://b.c/d/e/f/f848/h_i.j', new: 'a://b.c/d/e/f/f848/f848.i' },
    { old: 'a://b.c/d/e/f/f739/h_i.j', new: 'a://b.c/d/e/f/f739/f739.i' },
    { old: 'a://b.c/d/e/f/f202/h_i.j', new: 'a://b.c/d/e/f/f202/f202.i' },
    { old: 'a://b.c/d/e/f/f443/h_i.j', new: 'a://b.c/d/e/f/f443/f443.i' },
    { old: 'a://b.c/d/e/f/f823/h_i.j', new: 'a://b.c/d/e/f/f823/f823.i' },
];

function encrypt(url) {
    const parts = url.match(/[a-z]+|\d+/ig);
    let encrypted = url;
    const map = {};
    let charCode = 97; // ASCII code for 'a'

    parts.forEach(part => {
        const char = '|' + String.fromCharCode(charCode) + '|'; // Delimiter added
        map[char] = part;
        encrypted = encrypted.replace(new RegExp(part, 'g'), char);
        charCode++;
    });

    return { encrypted, map };
}

// Helper function to decrypt the URL
function decrypt(encrypted, map) {
    console.log('Starting decryption process...');
    console.log(`Encrypted URL: ${encrypted}`);
    console.log('Decryption Map:', map);

    let decrypted = encrypted;
    for (const key in map) {
        // Use the key directly without extra escaping
        console.log(`Replacing all occurrences of '${key}' with '${map[key]}'`);
        decrypted = decrypted.replace(new RegExp(key, 'g'), map[key]);
        console.log(`Current state of URL: ${decrypted}`);
    }

    console.log(`Decrypted URL: ${decrypted}`);
    return decrypted;
}


// Function to transform the encrypted URL using OpenAI API
async function transformUrl(encryptedUrl) {
    try {
        const messages = [
            { "role": "system", "content": "Your task is to analyze the URL transformation patterns from the given examples and apply the same pattern to transform the new URL. Respond with the transformed URL only." }
        ];

        // Add a few examples from existing mappings
        existingMappings.slice(0, 3).forEach(mapping => {
            messages.push(
                { "role": "user", "content": `Transform this URL: ${mapping.old}` },
                { "role": "assistant", "content": `${mapping.new}` }
            );
        });

        // Add the new URL to transform
        messages.push({ "role": "user", "content": `Transform this URL: ${encryptedUrl}` });

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages
        });

        const lastMessage = completion.choices[0].message;
        return lastMessage ? lastMessage.content : null;
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return null;
    }
}

// Main function to run the URL shortener
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // First: Get URL from user
    rl.question('Please paste in a URL: ', async (url_original) => {
        console.log(`Original URL: ${url_original}`);

        // Second: Encrypt the URL
        const { encrypted, map } = encrypt(url_original);
        console.log(`Encrypted URL: ${encrypted}`);
        console.log('Encryption Map:', map);

        // Third: Transform the encrypted URL using OpenAI API
        const transformedEncryptedUrl = await transformUrl(encrypted, existingMappings);
        if (!transformedEncryptedUrl) {
            console.error('Failed to transform URL.');
            rl.close();
            return;
        }
        console.log(`Transformed Encrypted URL: ${transformedEncryptedUrl}`);

        // Fourth: decrypt the transformed URL
        const transformedUrl = decrypt(transformedEncryptedUrl, map);
        console.log(`Transformed URL: ${transformedUrl}`);

        rl.close();
    });
}

main();