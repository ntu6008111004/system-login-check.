const https = require('https');

const url = 'https://script.google.com/macros/s/AKfycbznzXnTuM1YqJDPoiQeXYwgCnTqgpngyjsKTQZ57Q2OKlrLKLzX9nS-ilMPwfHTNuu_/exec';
const username = 'Patcha';
const password = 'f66b80548723f8baa97e85a4ee647d6e52daec293d252a66bf129374721d1b4c';
const payload = { username, password };
const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');

const apiCall = `${url}?action=login&payload=${payloadStr}`;

https.get(apiCall, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response:', data);
  });
}).on('error', (err) => {
  console.log('Error:', err.message);
});
