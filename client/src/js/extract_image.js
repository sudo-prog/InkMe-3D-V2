const fs = require('fs');

//Reading JSON file
const jsonData = fs.readFileSync('/Users/super/Downloads/long bao.inkme', 'utf8');
const data = JSON.parse(jsonData);

//Iterating through all images in savedImages
for (const [key, value] of Object.entries(data.savedImages)) {
    //Identifying image format
    const match = value.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
        console.warn(`Could not identify image format for key: ${key}`);
        continue;
    }
    const ext = match[1]; // jpg, png, ...
    const base64Image = match[2];
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const filename = `${key}.${ext}`;
    fs.writeFileSync(filename, imageBuffer);
    console.log(`Saved image: ${filename}`);
} 