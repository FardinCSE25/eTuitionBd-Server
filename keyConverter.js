const fs = require('fs');
const key = fs.readFileSync('./etuitionbd-a1c8c-firebase-adminsdk-fbsvc-d84f5ccea7.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)