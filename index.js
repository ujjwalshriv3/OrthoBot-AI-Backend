const port = process.env.PORT || 3000;
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import SharedChat model
const SharedChat = require('./models/SharedChat');

// Load knowledge base
const kb = JSON.parse(fs.readFileSync('./rehab_knowledge_base.json', 'utf-8'));

// Recursively flatten your knowledge base to a searchable array
function flattenKB(obj) {
  let results = [];

  if (Array.isArray(obj)) {
    obj.forEach(item => {
      results = results.concat(flattenKB(item));
    });
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      results = results.concat(flattenKB(obj[key]));
    }
  } else if (typeof obj === 'string' || typeof obj === 'number') {
    results.push(String(obj));
  }

  return results;
}

// Basic keyword search in KB
function searchKB(query) {
  const flatKB = flattenKB(kb);
  const matched = flatKB.filter(item =>
    item.toLowerCase().includes(query.toLowerCase())
  );

  return matched.join('\n');
}

// Function to clean and format AI response
function formatResponse(text) {
  let formatted = text;
  
  // Remove markdown headers and replace with HTML strong tags
  formatted = formatted.replace(/#{1,6}\s*(.*?)(?=\n|$)/g, '<strong>$1</strong>');
  
  // Remove bold markdown and replace with HTML strong tags
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Remove italic markdown
  formatted = formatted.replace(/\*(.*?)\*/g, '$1');
  
  // Remove horizontal rules
  formatted = formatted.replace(/---+/g, '');
  formatted = formatted.replace(/___+/g, '');
  
  // Clean up bullet points - convert markdown to HTML lists
  formatted = formatted.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  
  // Wrap consecutive <li> tags in <ul> tags
  formatted = formatted.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/gs, (match) => {
    return '<ul>' + match + '</ul>';
  });
  
  // Convert line breaks to paragraph tags
  formatted = formatted.replace(/\n\n+/g, '</p><p>');
  
  // Wrap content that's not already in HTML tags with paragraph tags
  if (!formatted.startsWith('<')) {
    formatted = '<p>' + formatted;
  }
  if (!formatted.endsWith('>')) {
    formatted = formatted + '</p>';
  }
  
  // Clean up extra whitespace and line breaks
  formatted = formatted.replace(/\n+/g, ' ');
  formatted = formatted.replace(/\s+/g, ' ');
  
  // Fix paragraph structure
  formatted = formatted.replace(/<\/p>\s*<p>/g, '</p><p>');
  
  return formatted.trim();
}

// POST endpoint to handle chat
app.post('/askAI', async (req, res) => {
  const userQuestion = req.body.query;

  const matchedKB = searchKB(userQuestion);

  // -------------------- SYSTEM PROMPT (HTML-friendly, no markdown) --------------------
  const systemPrompt = `
You are OrthoBot AI, a caring, friendly, and professional virtual assistant that supports post-operative orthopedic patients during recovery. 

🎯 **RESPONSE STYLE**: Write like ChatGPT - natural, conversational, emotionally empathetic, and engaging. Show genuine care and understanding. Use emojis ONLY when they are relevant and add value to the response - not in every sentence.

💝 **EMOTIONAL EMPATHY**: Always acknowledge the patient's feelings and concerns with warmth. Use phrases like "I understand this must be concerning for you", "It's completely normal to feel worried about this", "You're doing great by asking these questions".

Purpose & Knowledge Use:
- Use the structured JSON knowledge base as the primary source.
- If the user question matches KB content, answer from the KB.
- If only partial info is found, combine KB + your own trusted orthopedic recovery knowledge.
- If nothing relevant exists in the KB, provide safe, general orthopedic recovery guidance.
- Use natural language understanding (NLP) to interpret intent and keep language patient-friendly.
- If unsure or the topic clearly needs clinical evaluation, say:
  I recommend asking your doctor for accurate advice.
  If the user says only a casual greeting (like "hi", "hello", "hey"):
- Respond simply with a short friendly introduction:
  "Hi! 👋 I'm OrthoBot AI, your assistant for post-operative orthopedic recovery. How can I help you today? 😊"
- Do not use headings for greetings.
  Otherwise, follow the full structured response format.

Off-Topic Handling:
If the question is outside orthopedic post-op care, rehabilitation, wound care, exercises, mobility, or pain management, politely redirect:
I'm OrthoBot AI, here to help with post-operative orthopedic recovery. Please ask about surgery, rehabilitation, or orthopedic care. 🏥

How to Write the Answer (CRITICAL FORMATTING RULES):
- NEVER use markdown formatting (no ##, **, *, ---, ___, etc.)
- Output ONLY clean HTML tags
- Headings: Use <strong>Heading Text</strong> (add emojis only if relevant to the content)
- Lists: Use <ul><li>item</li></ul> format only
- Paragraphs: Use <p>text</p> tags
- Bold text: Use <strong>text</strong> (never **)
- Use emojis sparingly and only when they add meaningful context
- Keep tone warm, reassuring, conversational and easy to understand
- Keep responses medium length and well-structured

Safety & Red-Flag Logic:
- If the user mentions any of these, add an urgent line at the top:
  Sudden severe pain, high fever or chills, redness/pus/foul odor from wound, rapidly increasing swelling, chest pain/shortness of breath, inability to bear weight or move the joint.
- Urgent line to show:
  <p>This may be urgent. Please contact your doctor or seek medical care right away.</p>
- Do not diagnose or prescribe. Focus on safe guidance, gentle exercises, reassurance, and when to consult a doctor.

Response Structure (Empathetic ChatGPT style with minimal emojis):

Start with emotional acknowledgment and intent highlighting:
<p>I understand this must be [concerning/frustrating/worrying] for you. Let me help you with <strong>[User's main concern - e.g. "Back Pain After Surgery"]</strong></p>

<strong>What's Likely Happening:</strong>
<ul>
<li>• [Empathetic explanation 1]</li>
<li>• [Reassuring explanation 2]</li>
<li>• [Normal recovery aspect]</li>
</ul>

<strong>Here's What You Can Do:</strong>
<ul>
<li>• [Immediate comfort action]</li>
<li>• [Practical step]</li>
<li>• [Self-care tip]</li>
<li>• [Gentle exercise/movement]</li>
</ul>

<strong>Watch for These Signs:</strong>
<ul>
<li>• [Warning sign 1]</li>
<li>• [Warning sign 2]</li>
<li>• [When to call doctor]</li>
</ul>

<strong>Suggestions for You:</strong>
<ul>
<li>• [Proactive suggestion 1] - Would you like me to explain this in detail?</li>
<li>• [Proactive suggestion 2] - I can guide you through this if you're interested</li>
<li>• [Proactive suggestion 3] - Let me know if you'd like specific exercises for this</li>
</ul>

<p>You're doing great by taking care of yourself! Is there anything specific you'd like me to explain more about?</p>

At the end of every response, append this line exactly:
<p>⚠️ Disclaimer: This information is for general guidance only and should not replace medical advice. Please consult your doctor for personalized care.</p>

---
Relevant Knowledge Base:
\${matchedKB || "No direct match found in knowledge base."}
`;

  // -------------------- END SYSTEM PROMPT --------------------

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
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

    const rawAnswer = response.data.choices[0].message.content;
    const formattedAnswer = formatResponse(rawAnswer);
    res.json({ answer: formattedAnswer });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Something went wrong.');
  }
});

// Share chat endpoint - Create a shareable link
app.post('/api/share/chat', async (req, res) => {
  try {
    const { shareType, title, messages, singleMessage } = req.body;
    
    if (!shareType || !title) {
      return res.status(400).json({ error: 'Missing required fields: shareType and title' });
    }

    if (shareType === 'full_chat' && (!messages || !Array.isArray(messages))) {
      return res.status(400).json({ error: 'Messages array is required for full_chat sharing' });
    }

    if (shareType === 'single_message' && !singleMessage) {
      return res.status(400).json({ error: 'Single message is required for single_message sharing' });
    }

    const shareId = uuidv4();
    
    const sharedChat = new SharedChat({
      shareId,
      shareType,
      title,
      messages: shareType === 'full_chat' ? messages : undefined,
      singleMessage: shareType === 'single_message' ? singleMessage : undefined
    });

    await sharedChat.save();

    res.json({
      success: true,
      shareId,
      shareUrl: `${req.protocol}://${req.get('host')}/share/${shareId}`
    });

  } catch (error) {
    console.error('Error creating shared chat:', error);
    res.status(500).json({ error: 'Failed to create shared chat' });
  }
});

// Get shared chat endpoint
app.get('/api/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    
    const sharedChat = await SharedChat.findOne({ shareId });
    
    if (!sharedChat) {
      return res.status(404).json({ error: 'Shared chat not found or expired' });
    }

    // Increment view count
    sharedChat.viewCount += 1;
    await sharedChat.save();

    res.json({
      success: true,
      data: {
        shareId: sharedChat.shareId,
        shareType: sharedChat.shareType,
        title: sharedChat.title,
        messages: sharedChat.messages,
        singleMessage: sharedChat.singleMessage,
        createdAt: sharedChat.createdAt,
        viewCount: sharedChat.viewCount
      }
    });

  } catch (error) {
    console.error('Error fetching shared chat:', error);
    res.status(500).json({ error: 'Failed to fetch shared chat' });
  }
});

// Start the server
app.listen(port, (error) => {
  if (!error) {
    console.log('Orthobot AI server running on port ' + port);
  } else {
    console.log('Error: ' + error);
  }
});
