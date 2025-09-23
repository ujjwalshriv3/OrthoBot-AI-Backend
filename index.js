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
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import SharedChat model
const SharedChat = require('./models/SharedChat');

// Import Conversational Agent
const ConversationalAgent = require('./conversationalAgent');
const conversationalAgent = new ConversationalAgent();

// Import Voice Session Service
const VoiceSessionService = require('./services/voiceSessionService');
const voiceSessionService = new VoiceSessionService();

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

// Enhanced POST endpoint with conversational AI agent
app.post('/askAI', async (req, res) => {
  const { query: userQuestion, userId = 'anonymous', useConversationalAgent = true, source = 'text', sessionId = null } = req.body;
  
  console.log('📥 Received request:', { userQuestion, userId, source, useConversationalAgent, sessionId });

  // Use voice session service for voice calls with session memory
  if (source === 'voice') {
    try {
      console.log('🎤 Processing voice message with session memory...');
      // Ensure we have a session from the very first user message
      let ensuredSessionId = sessionId;
      if (!ensuredSessionId && userId) {
        const activeSession = await voiceSessionService.ensureActiveSession(userId, 'voice_call');
        ensuredSessionId = activeSession.sessionId;
        console.log('✅ Using active voice session for first message:', ensuredSessionId);
      }

      if (!ensuredSessionId) {
        return res.status(400).json({ error: 'sessionId or userId is required for voice messages' });
      }

      const result = await voiceSessionService.handleVoiceMessage(ensuredSessionId, userQuestion, GROQ_API_KEY);
      console.log('✅ Voice session response:', result);
      
      return res.json({ 
        response: result.response,
        answer: result.response,
        detectedLanguage: result.detectedLanguage,
        detectedEmotion: result.detectedEmotion,
        sessionContext: result.sessionContext,
        isVoiceSession: true,
        sessionActive: result.isActive,
        sessionId: ensuredSessionId
      });
    } catch (error) {
      console.error('❌ Voice session error:', error);
      // Fall back to regular conversational agent
    }
  }

  // Use conversational agent if enabled
  if (useConversationalAgent) {
    try {
      console.log('🤖 Processing with conversational agent...');
      const result = await conversationalAgent.processMessage(userId, userQuestion, GROQ_API_KEY);
      console.log('✅ Conversational agent response:', result);
      
      return res.json({ 
        response: result.response,  // Changed from 'answer' to 'response'
        answer: result.response,    // Keep both for compatibility
        detectedLanguage: result.detectedLanguage,
        detectedEmotion: result.detectedEmotion,
        conversationId: result.conversationId,
        isConversational: true
      });
    } catch (error) {
      console.error('❌ Conversational agent error:', error);
      // Fall back to original system if conversational agent fails
    }
  }

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

// Conversational Agent Endpoints

// Get conversation history
app.get('/api/conversation/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const history = conversationalAgent.getConversationHistory(userId);
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// Clear conversation history
app.delete('/api/conversation/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    conversationalAgent.clearConversationHistory(userId);
    res.json({ success: true, message: 'Conversation history cleared' });
  } catch (error) {
    console.error('Error clearing conversation history:', error);
    res.status(500).json({ error: 'Failed to clear conversation history' });
  }
});

// Get conversation statistics
app.get('/api/conversation/:userId/stats', (req, res) => {
  try {
    const { userId } = req.params;
    const stats = conversationalAgent.getConversationStats(userId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching conversation stats:', error);
    res.status(500).json({ error: 'Failed to fetch conversation stats' });
  }
});

// Azure Speech: Exchange subscription key for short-lived token
app.get('/api/azure/tts/token', async (req, res) => {
  try {
    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      return res.status(400).json({ error: 'Azure Speech env vars missing', haveKey: Boolean(AZURE_SPEECH_KEY), region: AZURE_SPEECH_REGION || null });
    }

    const tokenResp = await axios.post(
      `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({
      token: tokenResp.data,
      region: AZURE_SPEECH_REGION,
      expiresInSeconds: 540 // ~9 minutes typical
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || error.message;
    console.error('Error getting Azure Speech token:', { status, data, region: AZURE_SPEECH_REGION });
    res.status(status).json({ error: 'Failed to get Azure Speech token', details: data, region: AZURE_SPEECH_REGION });
  }
});

// Azure Speech: Full health check (token + tiny synthesis)
app.get('/api/azure/tts/health', async (req, res) => {
  try {
    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      return res.status(400).json({ ok: false, error: 'Azure Speech env vars missing', haveKey: Boolean(AZURE_SPEECH_KEY), region: AZURE_SPEECH_REGION || null });
    }

    // 1) Get token
    const tokenResp = await axios.post(
      `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    const token = tokenResp.data;

    // 2) Do a tiny synthesis request
    const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="en-US-JennyNeural">
    <mstts:express-as style="chat">ok</mstts:express-as>
  </voice>
</speak>`;

    const synthResp = await axios.post(
      `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      ssml,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
        },
        responseType: 'arraybuffer'
      }
    );

    return res.json({ ok: true, region: AZURE_SPEECH_REGION, tokenIssued: true, synthStatus: synthResp.status, contentType: synthResp.headers['content-type'] });
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || error.message;
    console.error('Azure TTS health check failed:', { status, data, region: AZURE_SPEECH_REGION });
    return res.status(status).json({ ok: false, region: AZURE_SPEECH_REGION, details: data });
  }
});

// Azure Speech: List available voices for the configured region
app.get('/api/azure/tts/voices', async (req, res) => {
  try {
    if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
      return res.status(400).json({ error: 'Azure Speech env vars missing', haveKey: Boolean(AZURE_SPEECH_KEY), region: AZURE_SPEECH_REGION || null });
    }

    const voicesResp = await axios.get(
      `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY
        }
      }
    );

    res.json({ region: AZURE_SPEECH_REGION, count: voicesResp.data?.length || 0, voices: voicesResp.data });
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || error.message;
    console.error('Error fetching Azure voices:', { status, data, region: AZURE_SPEECH_REGION });
    res.status(status).json({ error: 'Failed to fetch Azure voices', details: data, region: AZURE_SPEECH_REGION });
  }
});

// Get greeting in user's preferred language
app.post('/api/greeting', (req, res) => {
  try {
    const { language = 'english', userName = null } = req.body;
    const greeting = conversationalAgent.getGreeting(language, userName);
    res.json({ success: true, greeting });
  } catch (error) {
    console.error('Error generating greeting:', error);
    res.status(500).json({ error: 'Failed to generate greeting' });
  }
});

// Voice Session Management Endpoints

// Start voice session
app.post('/api/voice/session/start', async (req, res) => {
  try {
    const { userId, sessionType = 'voice_call' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const sessionInfo = await voiceSessionService.startVoiceSession(userId, sessionType);
    
    res.json({
      success: true,
      ...sessionInfo
    });
  } catch (error) {
    console.error('Error starting voice session:', error);
    res.status(500).json({ error: 'Failed to start voice session' });
  }
});

// End voice session
app.post('/api/voice/session/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await voiceSessionService.endVoiceSession(sessionId);
    
    if (result) {
      res.json({
        success: true,
        ...result
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error ending voice session:', error);
    res.status(500).json({ error: 'Failed to end voice session' });
  }
});

// Get voice session info
app.get('/api/voice/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionInfo = await voiceSessionService.getSessionInfo(sessionId);
    
    if (sessionInfo) {
      res.json({
        success: true,
        session: sessionInfo
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// Get user's voice session history
app.get('/api/voice/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    const sessions = await voiceSessionService.getUserSessions(userId, parseInt(limit));
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error getting user sessions:', error);
    res.status(500).json({ error: 'Failed to get user sessions' });
  }
});

// Get voice session history (for saving to chat history before deletion)
app.post('/api/voice/session/history', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Import VoiceSession model to get conversation history directly
    const VoiceSession = require('./models/VoiceSession');
    const session = await VoiceSession.findOne({ sessionId });
    
    if (session) {
      res.json({
        success: true,
        sessionId: session.sessionId,
        conversationHistory: session.conversationHistory || [],
        primaryTopics: session.sessionContext.primaryTopics || [],
        patientCondition: session.sessionContext.patientCondition,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt
      });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error getting voice session history:', error);
    res.status(500).json({ error: 'Failed to get voice session history' });
  }
});

// Cleanup expired sessions (admin endpoint)
app.post('/api/voice/cleanup', async (req, res) => {
  try {
    const deletedCount = await voiceSessionService.cleanupExpiredSessions();
    
    res.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} expired sessions`
    });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
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
