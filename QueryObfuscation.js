const readline = require('readline');
const axios = require('axios');
// const { MongoClient } = require('mongodb');
// const OpenAI = require('openai');

// // MongoDB setup
// const mongoUri = 'mongodb+srv://tfenner:curve@fable.kclnqum.mongodb.net/';
// const dbName = 'fable';
// const collectionName = 'urlMappings';

// Initialize MongoDB client
// const client = new MongoClient(mongoUri);

// // OpenAI setup
// const OPENAI_API_KEY = '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';
// const openai = new OpenAI({
//     apiKey: OPENAI_API_KEY
// });

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
async function getExistingMappingsForRoot(url) {
    try {

        const root = new URL(url).origin;

        // HTTP request to your backend server
        const response = await axios.post('http://localhost:3000/mongodb', { url });

        if (!response.data || response.data.length === 0) {
            return [];
        }

        return response.data;
    } catch (error) {
        console.error('Error calling backend for MongoDB:', error);
        return [];
    }
}


function encrypt(url) {
    const parts = url.match(/[a-z]+|\d+/ig);
    let encrypted = url;
    const map = {};
    let charCode = 97; // ASCII code for 'a'

    parts.forEach(part => {
        if (!Object.values(map).includes(part)) { // Check if part is not already in the map
            const char = '|' + String.fromCharCode(charCode) + '|'; // Delimiter added
            map[char] = part;

            // Replace only the first occurrence of 'part'
            encrypted = encrypted.replace(part, () => {
                charCode++;
                return char;
            });
        }
    });

    return { encrypted, map };
}



// right now it only does the first, i want all?
// Helper function to decrypt the URL
function decrypt(encrypted, map) {
    console.log('Starting decryption process...');
    // console.log(`Encrypted URL: ${encrypted}`);

    let decrypted = encrypted;
    for (const key in map) {
        let keyPosition = decrypted.indexOf(key);
        while (keyPosition !== -1) {
            // console.log(`Found the key '${key}' at position ${keyPosition}`);
            decrypted = decrypted.replace(key, map[key]);
            // console.log(`Current state of URL: ${decrypted}`);
            keyPosition = decrypted.indexOf(key); // Update key position for the next iteration
        }
    }

    console.log(`Decrypted URL: ${decrypted}`);
    return decrypted;
}




async function transformUrl(encryptedUrl, existingMappings) {
    try {
        const systemMessage = "Examine the following mappings for their transformation patterns and predict the transformation of the new URL based on these patterns. Respond with the transformed URL only (do not include the original. do not include text.).";
        const exampleMappings = existingMappings.slice(0, 3).map(mapping => 
            `${mapping.old} -> ${mapping.new}`
        ).join('\n');
        const query = `Based on this pattern, please predict the transformation of the following URL, and respond only with the transformed URL and nothing else (do not include the original. do not include text):\n${encryptedUrl} -> ?`;

        const messages = [
            { "role": "system", "content": systemMessage },
            { "role": "user", "content": exampleMappings },
            { "role": "user", "content": query }
        ];

        // HTTP request to backend server
        console.log("Sending request to backend /openai endpoint");
        const response = await axios.post('http://localhost:3000/openai', { messages });

        // Check response structure
        if (response.data && response.data.choices && response.data.choices.length > 0) {
            const transformedUrl = response.data.choices[0].message.content.trim();
            console.log(`Transformed URL received: ${transformedUrl}`);
            return transformedUrl;
        } else {
            throw new Error('Invalid response structure from OpenAI API');
        }
    } catch (error) {
        console.error('Error calling backend for OpenAI API:', error);
        console.error('Error details:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Main function to run the URL shortener
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Please paste in a URL: ', async (url_original) => {
        const { encrypted, map } = encrypt(url_original);
        const existingMappings = await getExistingMappingsForRoot(url_original);

        if (existingMappings.length === 0) {
            console.log('No mappings to pass to OpenAI. Ending process.');
            rl.close();
            return;
        }

        const transformedEncryptedUrl = await transformUrl(encrypted, existingMappings);
        if (!transformedEncryptedUrl) {
            console.error('Failed to transform URL.');
            rl.close();
            return;
        }

        const transformedUrl = decrypt(transformedEncryptedUrl, map);
        console.log(`*******************`);

        console.log(``);

        console.log(`Original URL: ${url_original}`);
        console.log(`Transformed URL: ${transformedUrl}`);

        rl.close();
    });
}

main();
