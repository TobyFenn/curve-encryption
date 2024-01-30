const readline = require('readline');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const OpenAI = require('openai');

// MongoDB setup
const mongoUri = 'mongodb+srv://tfenner:curve@fable.kclnqum.mongodb.net/';
const dbName = 'fable';
const collectionName = 'urlMappings';

// Initialize MongoDB client
const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// OpenAI setup
const OPENAI_API_KEY = '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';
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

// Function to connect to the MongoDB database
async function connectToDatabase() {
    try {
        await client.connect();
        console.log("Connected successfully to MongoDB");
        return client.db(dbName).collection(collectionName);
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}

// Function to get existing mappings from the database based on the URL root
async function getExistingMappingsForRoot(url, collection) {
    const root = new URL(url).origin;
    const mappings = await collection.findOne({ root: root });

    if (!mappings) {
        console.log(`No existing mappings found for root: ${root}`);
        return [];
    }

    console.log(`Found existing mappings for root: ${root}`);
    return mappings.urlPairs;
}

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
    const collection = await connectToDatabase();
    
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
        const existingMappings = await getExistingMappingsForRoot(url_original, collection);

        if (existingMappings.length === 0) {
            console.log('No mappings to pass to OpenAI. Proceeding with an empty mapping list.');
        }

        const transformedEncryptedUrl = await transformUrl(encrypted, existingMappings);        if (!transformedEncryptedUrl) {
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