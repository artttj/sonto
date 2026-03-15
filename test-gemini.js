const apiKey = process.env.GEMINI_API_KEY; // I don't have this, but I can check the error response!
fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=invalid')
  .then(res => res.text())
  .then(console.log);
