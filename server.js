const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Allow cross-origin requests (needed for HLS)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Serve HLS segments with correct MIME types
app.use('/hls', express.static(path.join(__dirname, 'hls_output'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filePath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }
  }
}));

// Serve the player page
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`HLS server running at http://localhost:${PORT}`);
});
