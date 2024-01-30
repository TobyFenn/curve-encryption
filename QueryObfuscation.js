const readline = require('readline');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const OpenAI = require('openai');

// MongoDB setup
const mongoUri = 'mongodb+srv://tfenner:curve@fable.kclnqum.mongodb.net/';
const dbName = 'fable';
const collectionName = 'urlMappings';

// Initialize MongoDB client
const client = new MongoClient(mongoUri);

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

    console.log(`Found existing mappings for root ${root}`);
    console.log(mappings.urlPairs);

    return mappings.urlPairs;
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
        // Construct the instructions and examples for the API
        const systemMessage = "Examine the following mappings for their transformation patterns and predict the transformation of the new URL based on these patterns. Respond with the transformed URL only (do not include the original. do not include text.).";
        const exampleMappings = existingMappings.slice(0, 3).map(mapping => 
            `${mapping.old} -> ${mapping.new}`
        ).join('\n');
        const query = `Based on this pattern, please predict the transformation of the following URL, and respond only with the transformed URL and nothing else (do not include the original. do not include text):\n${encryptedUrl} -> ?`;

        // console.log('Constructed Query for OpenAI:');
        // console.log(`${systemMessage}\n\n${exampleMappings}\n\n${query}`);

        // Prepare messages for the API call
        const messages = [
            { "role": "system", "content": systemMessage },
            { "role": "user", "content": exampleMappings },
            { "role": "user", "content": query }
        ];

        // Make the API call
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages
        });

        // console.log('API Response:');
        // console.log(JSON.stringify(completion, null, 2));

        const transformedUrl = completion.choices[0].message.content.trim();
        console.log(`Encrypted URL: ${transformedUrl}`);

        return transformedUrl;
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        console.log('Error Details:');
        console.log(error);
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
        // console.log(`Original URL: ${url_original}`);

        // Second: Encrypt the URL
        const { encrypted, map } = encrypt(url_original);
        // console.log(`Encrypted URL: ${encrypted}`);
        // console.log('Encryption Map:', map);

        // Third: Check for existing mappings
        const existingMappings = await getExistingMappingsForRoot(url_original, collection);

        if (existingMappings.length === 0) {
            console.log('No mappings to pass to OpenAI. Ending process.');
            rl.close();
            return; // Exit the function early
        }

        // Transform the encrypted URL using OpenAI API
        const transformedEncryptedUrl = await transformUrl(encrypted, existingMappings);
        if (!transformedEncryptedUrl) {
            console.error('Failed to transform URL.');
            rl.close();
            return;
        }
        
        // console.log(`Transformed Encrypted URL: ${transformedEncryptedUrl}`);

        // Fourth: decrypt the transformed URL
        const transformedUrl = decrypt(transformedEncryptedUrl, map);
        console.log(``);
        console.log(`*********************`);
        console.log(`original URL: ${url_original}`);
        console.log(`transformed URL: ${transformedUrl}`);

        rl.close();
    });
}

main();
