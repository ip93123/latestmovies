const https = require('https');
https.get('https://www.omdbapi.com/?i=tt0111161&apikey=trilogy', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
