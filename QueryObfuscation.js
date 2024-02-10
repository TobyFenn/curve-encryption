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

function obfuscateViaPair(url1, url2) {
    if (!url1 || !url2) {
        console.error('One or both URLs not provided for obfuscation');
        return { obfuscated1: null, obfuscated2: null, map: {} };
    }

    // Pre-process URLs to replace protocols
    let obfuscated1 = url1;
    let obfuscated2 = url2;
    const protocolMap = {};
    const protocols = ['https', 'http']; // Add more protocols if needed
    protocols.forEach(protocol => {
        if (url1.startsWith(protocol + "://")) {
            protocolMap[protocol] = 'a'; // Assuming 'a' is the starting char for mapping
            obfuscated1 = obfuscated1.replace(protocol + "://", 'a://');
            obfuscated2 = obfuscated2.replace(protocol + "://", 'a://');
        }
    });

    const regex = /[a-z\d]+/ig;
    const parts1 = url1.split(/[_\/\.\?&=]+/).flatMap(part => part.match(regex) || []);
    const parts2 = url2.split(/[_\/\.\?&=]+/).flatMap(part => part.match(regex) || []);
    const combinedParts = Array.from(new Set([...parts1, ...parts2]));

    const map = { ...protocolMap };
    let charCode = 'a'.charCodeAt(0); // Start from 'b' if 'a' is used for protocols

    combinedParts.forEach(part => {
        if (!Object.values(map).includes(part)) {
            const char = '|' + String.fromCharCode(charCode) + '|'; // Delimiter added
            map[char] = part;
            const partPattern = part.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
            const regexPattern = new RegExp(`(?<=[_\/\.\?&=]|^)(${partPattern})(?=[_\/\.\?&=]|$)`, 'g');

            obfuscated1 = obfuscated1.replace(regexPattern, char);
            obfuscated2 = obfuscated2.replace(regexPattern, char);

            charCode++;
        }
    });

    // Post-process to reapply protocol obfuscation if necessary
    // This step may be adjusted based on how protocols are handled in initial obfuscation
    protocols.forEach(protocol => {
        if (protocolMap[protocol]) {
            obfuscated1 = obfuscated1.replace('a://', protocolMap[protocol] + '://');
            obfuscated2 = obfuscated2.replace('a://', protocolMap[protocol] + '://');
        }
    });

    return { obfuscated1, obfuscated2, map };
}



function obfuscate(url) {
    if (!url) { // Check if the URL is undefined or empty
        console.error('No URL provided for obfuscation');
        return { obfuscated: null, map: {} };
    }

    const parts = url.match(/[a-z]+|\d+/ig);
    let obfuscated = url;
    const map = {};
    let charCode = 97; // ASCII code for 'a'

    parts.forEach(part => {
        console.error('part is ', part);
        if (!Object.values(map).includes(part)) { // Check if part is not already in the map
            const char = '|' + String.fromCharCode(charCode) + '|'; // Delimiter added
            map[char] = part;

            // Replace only the first occurrence of 'part'
            obfuscated = obfuscated.replace(part, () => {
                charCode++;
                return char;
            });
        }
    });

    return { obfuscated, map };
}

function obfuscateExistingMappings(existingMappings) {
    const obfuscatedExistingMappings = [];

    for (let i = 0; i < existingMappings.length; i++) {
        console.error('obfuscating mapping', i + 1, 'of', existingMappings.length);
        console.error('from ', existingMappings[i]);



        const { old: oldMapping, new: newMapping } = existingMappings[i];
        
        // Use obfuscateViaPair to obfuscate old and new mappings together
        const { obfuscated1: obfuscatedOld, obfuscated2: obfuscatedNew, map } = obfuscateViaPair(oldMapping, newMapping);

        // Add the result to the obfuscatedExistingMappings array
        obfuscatedExistingMappings.push({ old: obfuscatedOld, new: obfuscatedNew, map });
        console.error('to ', obfuscatedOld, obfuscatedNew);

    }

    return obfuscatedExistingMappings;
}



// right now it only does the first, i want all?
// Helper function to deobfuscate the URL
function deobfuscate(obfuscated, map) {
    console.log('Starting deobfuscation process...');

    console.log(map);

    // console.log(`obfuscated URL: ${obfuscated}`);

    let deobfuscated = obfuscated;
    for (const key in map) {
        console.log(`Replacing ${key} with ${map[key]}`);
        let keyPosition = deobfuscated.indexOf(key);
        while (keyPosition !== -1) {
            console.log(`Found the key '${key}' at position ${keyPosition}`);
            deobfuscated = deobfuscated.replace(key, map[key]);
            // console.log(`Current state of URL: ${deobfuscated}`);
            keyPosition = deobfuscated.indexOf(key); // Update key position for the next iteration
        }
    }

    console.log(`deobfuscated URL: ${deobfuscated}`);
    return deobfuscated;
}


async function transformUrlViaGPT(obfuscatedUrl, obfuscatedExistingMappings) {
    try {
        const systemMessage = "Examine the following mappings for their transformation patterns and predict the transformation of the new URL based on these patterns. Respond with the transformed URL only (do not include the original. do not include text.).";
        const exampleMappings = obfuscatedExistingMappings.slice(0, 3).map(mapping => {
            // Access the 'obfuscated' property of each mapping's old and new URLs
            return `${mapping.old} -> ${mapping.new}`;
        }).join('\n');
        const query = `Based on this pattern, please predict the transformation of the following URL, and respond only with the transformed URL and nothing else (do not include the original. do not include text):\n${obfuscatedUrl} -> ?`;

        const messages = [
            { "role": "system", "content": systemMessage },
            { "role": "user", "content": exampleMappings },
            { "role": "user", "content": query }
        ];

        // HTTP request to backend server
        console.log("Sending request to backend /openai endpoint");
        const response = await axios.post('http://localhost:3000/openai', { messages });

        console.log("GPT response message:", response.data.choices[0].message.content.trim());

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
        // const { obfuscated, map } = obfuscate(url_original);
        // const existingMappings = await getExistingMappingsForRoot(url_original);

        // if (existingMappings.length === 0) {
        //     console.log('No mappings to pass to OpenAI. Ending process.');
        //     rl.close();
        //     return;
        // }

        // const transformedobfuscatedUrl = await transformUrlViaGPT(obfuscated, existingMappings);

        // if (!transformedobfuscatedUrl) {
        //     console.error('Failed to transform URL.');
        //     rl.close();
        //     return;
        // }

        // const transformedUrl = deobfuscate(transformedobfuscatedUrl, map);
        // console.log(`*******************`);

        // console.log(``);

        // console.log(`Original URL: ${url_original}`);
        // console.log(`Transformed URL: ${transformedUrl}`);

        // rl.close();

        const existingMappings = await getExistingMappingsForRoot(url_original);

        if (existingMappings.length === 0) {
            console.log('No mappings to pass to OpenAI. Ending process.');
            rl.close();
            return;
        }

        const { obfuscated, map } = obfuscate(url_original);
        const obfuscatedExistingMappings = obfuscateExistingMappings(existingMappings);

        // console.error('obfuscatedExistingMappings', obfuscatedExistingMappings);


        //cal function for obfuscating existingMappings and storing in something called obfuscatedExistedMappings

        const transformedobfuscatedUrl = await transformUrlViaGPT(obfuscated, obfuscatedExistingMappings);

        if (!transformedobfuscatedUrl) {
            console.error('Failed to transform URL.');
            rl.close();
            return;
        }

        const transformedUrl = deobfuscate(transformedobfuscatedUrl, map);
        console.log(`*******************`);

        console.log(``);

        console.log(`Original URL: ${url_original}`);
        console.log(`Transformed URL: ${transformedUrl}`);

        rl.close();
    });

}

main();
