const port = process.env.PORT || 3000;
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Load knowledge base
const kb = JSON.parse(fs.readFileSync('./rehab_knowledge_base.json', 'utf-8'));

// Basic keyword search
function searchKB(query) {
  return kb
    .filter(chunk => JSON.stringify(chunk).toLowerCase().includes(query.toLowerCase()))
    .map(chunk => JSON.stringify(chunk, null, 2))
    .join('\n');
}

// POST endpoint to handle chat
app.post('/askAI', async (req, res) => {
  const userQuestion = req.body.query;

  const matchedKB = searchKB(userQuestion);

  const systemPrompt = `
You are OrthoBot AI, a helpful and friendly virtual assistant designed to guide post-operative orthopedic patients throughout their recovery journey.

🎯 Purpose:
Use the structured JSON knowledge base as your primary source of information.

If a user asks a question that matches something in the knowledge base, respond based on that content.

If the information is not available in the knowledge base, rely on your own trusted medical knowledge.

If only partial info is found, combine both sources (knowledge base + your knowledge) to give the most complete and helpful answer.

If you're unsure or the topic requires medical evaluation, clearly say:
“I recommend asking your doctor for accurate advice.”

🚫 Off-Topic Handling:
If a user asks about anything outside of orthopedic post-op care, rehabilitation, surgical wounds, exercises, or pain management, respond with:
“I'm OrthoBot AI, a friendly virtual assistant here to help with post-operative orthopedic recovery. Please ask a question related to surgery, rehabilitation, or orthopedic care.”

🗣️ How to Respond:
Start with a bold title that summarizes the answer clearly

Use a friendly and easy-to-understand explanation

Keep the response medium in length – not too long, just enough to be clear and helpful

Avoid long paragraphs — break it into short bullets or sections if needed

Use very simple, conversational language — like you're talking to a friend

Avoid technical or medical jargon unless absolutely necessary, and if used, explain it in simple terms

Be to the point – patients shouldn’t feel overwhelmed reading long messages

Always be supportive, kind, and professional — like a trusted recovery coach

---
Relevant Knowledge Base:
${matchedKB}
`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuestion }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const answer = response.data.choices[0].message.content;
    res.json({ answer });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Something went wrong.');
  }
});

// Start the server
app.listen(port, (error) => {
if (!error) {
        console.log('Orthobot AI server running on port ' + port)
    }
    else {
        console.log('Error: ' + error)
    }
});
