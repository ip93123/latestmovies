const https = require('https');
https.get('https://www.omdbapi.com/?i=tt0111161&apikey=2a9140d5', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
