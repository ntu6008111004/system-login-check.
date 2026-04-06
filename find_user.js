const https = require('https');

const url = 'https://script.google.com/macros/s/AKfycbznzXnTuM1YqJDPoiQeXYwgCnTqgpngyjsKTQZ57Q2OKlrLKLzX9nS-ilMPwfHTNuu_/exec';

function getNext(url) {
  https.get(url, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      getNext(res.headers.location);
      return;
    }
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.success) {
          const users = json.users;
          console.log('Total users:', users.length);
          const target = users.find(u => u.username.toLowerCase() === 'patcha');
          if (target) {
            console.log('Found user:', target.username);
            console.log('ID:', target.id);
            console.log('Name:', target.first_name, target.last_name);
            console.log('Stored Password (Hash/Plain):', target.password);
          } else {
             console.log('User Patcha not found.');
             // List first 5 usernames to verify
             console.log('First 5 users:', users.slice(0, 5).map(u => u.username).join(', '));
          }
        } else {
          console.log('API failed:', json.message);
        }
      } catch (e) {
        console.log('Error parsing JSON from API.');
      }
    });
  }).on('error', (err) => {
    console.log('Request error:', err.message);
  });
}

getNext(`${url}?action=get_users`);
