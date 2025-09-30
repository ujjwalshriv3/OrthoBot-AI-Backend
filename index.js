const port = process.env.PORT || 3000;
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

// Import Chat History Service
const ChatHistoryService = require('./services/chatHistoryService');
const chatHistoryService = new ChatHistoryService();

// Import User model
const Users = require('./models/UserSchema');

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

// Creating middleware to fetch user
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        return res.status(401).json({ 
            success: false,
            message: 'Please authenticate using valid token',
            data: null,
            timestamp: new Date().toISOString()
        });
    }
    try {
        const data = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user details from database to get updated information
        const user = await Users.findById(data.user.id).select('-password');
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: 'User not found',
                data: null,
                timestamp: new Date().toISOString()
            });
        }
        
        // Add user info and timestamps to request
        req.user = {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
        };
        req.requestTimestamp = new Date().toISOString();
        
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            message: 'Please authenticate using valid token',
            data: null,
            timestamp: new Date().toISOString()
        });
    }
};

// Creating endpoint for registering the user
app.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
                data: null,
                timestamp: new Date().toISOString()
            });
        }

        // Check if user already exists (case-insensitive)
        const emailLowerCase = email.toLowerCase().trim();
        console.log('Checking for email:', emailLowerCase);
        
        let existingUser = await Users.findOne({ 
            email: emailLowerCase
        });
        
        console.log('Found existing user:', existingUser ? 'YES' : 'NO');
        if (existingUser) {
            console.log('Existing user details:', existingUser.email);
        }
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists",
                data: null,
                timestamp: new Date().toISOString()
            });
        }

        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const user = new Users({
            firstName: firstName,
            lastName: lastName,
            email: emailLowerCase,
            password: hashedPassword
        });

        await user.save();

        // Create JWT token
        const tokenData = {
            user: {
                id: user.id
            }
        };
        const token = jwt.sign(tokenData, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                token: token,
                createdAt: user.createdAt,
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during registration',
            data: null,
            timestamp: new Date().toISOString()
        });
    }
});

// Creating endpoint for logging the user
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
                data: null,
                timestamp: new Date().toISOString()
            });
        }

        // Find user by email
        let user = await Users.findOne({ email: email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                data: null,
                timestamp: new Date().toISOString()
            });
        }

        // Compare password with hashed password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password',
                data: null,
                timestamp: new Date().toISOString()
            });
        }

        // Update lastLogin timestamp
        user.lastLogin = new Date();
        await user.save();

        // Create JWT token
        const tokenData = {
            user: {
                id: user.id
            }
        };
        const token = jwt.sign(tokenData, process.env.JWT_SECRET, { expiresIn: '24h' });

        res.status(200).json({
            success: true,
            message: 'User logged in successfully',
            data: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                token: token,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login',
            data: null,
            timestamp: new Date().toISOString()
        });
    }
});

// Test endpoint to check existing users (for debugging)
app.get('/api/users/check', async (req, res) => {
    try {
        const users = await Users.find({}, 'firstName lastName email createdAt');
        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// Test endpoint to delete a user by email (for testing only)
app.delete('/api/users/delete/:email', async (req, res) => {
    try {
        const email = req.params.email.toLowerCase().trim();
        const deletedUser = await Users.findOneAndDelete({ 
            email: email
        });
        
        if (deletedUser) {
            res.json({
                success: true,
                message: 'User deleted successfully',
                deletedUser: {
                    firstName: deletedUser.firstName,
                    lastName: deletedUser.lastName,
                    email: deletedUser.email
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: error.message
        });
    }
});

// ==================== CHAT HISTORY API ENDPOINTS ====================

// Create new chat session
app.post('/api/chat/new', async (req, res) => {
  try {
    const { userId, title, sessionType = 'text_chat' } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const newChat = await chatHistoryService.createNewChat(userId, title, sessionType);
    
    res.json({
      success: true,
      ...newChat
    });
  } catch (error) {
    console.error('Error creating new chat:', error);
    res.status(500).json({ error: 'Failed to create new chat' });
  }
});

// Get user's chat history list
app.get('/api/chat/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;
    
    const result = await chatHistoryService.getUserChatHistory(userId, parseInt(limit), parseInt(skip));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Get full chat conversation
app.get('/api/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.query;
    
    const result = await chatHistoryService.getChatConversation(chatId, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error fetching chat conversation:', error);
    res.status(500).json({ error: 'Failed to fetch chat conversation' });
  }
});

// Add message to chat
app.post('/api/chat/:chatId/message', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { role, content, userId } = req.body;
    
    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' });
    }

    const result = await chatHistoryService.addMessageToChat(chatId, role, content, userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error adding message to chat:', error);
    res.status(500).json({ error: 'Failed to add message to chat' });
  }
});

// Update chat title
app.put('/api/chat/:chatId/title', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title, userId } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await chatHistoryService.updateChatTitle(chatId, title, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error updating chat title:', error);
    res.status(500).json({ error: 'Failed to update chat title' });
  }
});

// Delete chat
app.delete('/api/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId } = req.query;
    
    const result = await chatHistoryService.deleteChat(chatId, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// Save voice conversation to chat history
app.post('/api/chat/voice/save', async (req, res) => {
  try {
    const { userId, conversationHistory, sessionMetadata } = req.body;
    
    if (!userId || !conversationHistory) {
      return res.status(400).json({ error: 'userId and conversationHistory are required' });
    }

    const result = await chatHistoryService.saveVoiceConversationToHistory(userId, conversationHistory, sessionMetadata);
    
    res.json(result);
  } catch (error) {
    console.error('Error saving voice conversation:', error);
    res.status(500).json({ error: 'Failed to save voice conversation' });
  }
});

// Get or create active chat for user
app.get('/api/chat/active/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await chatHistoryService.getOrCreateActiveChat(userId);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error getting active chat:', error);
    res.status(500).json({ error: 'Failed to get active chat' });
  }
});

// Get chat statistics for user
app.get('/api/chat/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await chatHistoryService.getChatStats(userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    res.status(500).json({ error: 'Failed to fetch chat stats' });
  }
});

// Enhanced askAI endpoint with chat history integration
app.post('/api/chat/message', async (req, res) => {
  const { query: userQuestion, userId, chatId, useConversationalAgent = true, source = 'text', sessionId = null } = req.body;
  
  console.log('📥 Received chat message:', { userQuestion, userId, chatId, source, useConversationalAgent, sessionId });

  try {
    // Get or create active chat if no chatId provided
    let activeChatId = chatId;
    if (!activeChatId && userId) {
      const activeChat = await chatHistoryService.getOrCreateActiveChat(userId);
      activeChatId = activeChat.chatId;
    }

    // Add user message to chat history
    if (activeChatId && userId) {
      await chatHistoryService.addMessageToChat(activeChatId, 'user', userQuestion, userId);
    }

    // Use voice session service for voice calls with session memory
    if (source === 'voice') {
      try {
        console.log('🎤 Processing voice message with session memory...');
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
        
        // Add bot response to chat history if we have chatId
        if (activeChatId && userId) {
          await chatHistoryService.addMessageToChat(activeChatId, 'assistant', result.response, userId);
        }
        
        return res.json({ 
          response: result.response,
          answer: result.response,
          detectedLanguage: result.detectedLanguage,
          detectedEmotion: result.detectedEmotion,
          sessionContext: result.sessionContext,
          isVoiceSession: true,
          sessionActive: result.isActive,
          sessionId: ensuredSessionId,
          chatId: activeChatId
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
        
        // Add bot response to chat history
        if (activeChatId && userId) {
          await chatHistoryService.addMessageToChat(activeChatId, 'assistant', result.response, userId);
        }
        
        return res.json({ 
          response: result.response,
          answer: result.response,
          detectedLanguage: result.detectedLanguage,
          detectedEmotion: result.detectedEmotion,
          conversationId: result.conversationId,
          isConversational: true,
          chatId: activeChatId
        });
      } catch (error) {
        console.error('❌ Conversational agent error:', error);
        // Fall back to original system if conversational agent fails
      }
    }

    // Fallback to original askAI logic
    const matchedKB = searchKB(userQuestion);
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

At the end of every response, append this line exactly:
<p>⚠️ Disclaimer: This information is for general guidance only and should not replace medical advice. Please consult your doctor for personalized care.</p>

---
Relevant Knowledge Base:
\${matchedKB || "No direct match found in knowledge base."}
`;

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
    
    // Add bot response to chat history
    if (activeChatId && userId) {
      await chatHistoryService.addMessageToChat(activeChatId, 'assistant', formattedAnswer, userId);
    }
    
    res.json({ 
      answer: formattedAnswer,
      response: formattedAnswer,
      chatId: activeChatId
    });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Something went wrong.');
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'orthobot_secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Authentication Routes

// User signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await Users.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const newUser = new Users({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date(),
      lastLogin: new Date()
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser._id, 
        email: newUser.email 
      },
      process.env.JWT_SECRET || 'orthobot_secret_key',
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const userData = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      createdAt: newUser.createdAt,
      lastLogin: newUser.lastLogin
    };

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await Users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email 
      },
      process.env.JWT_SECRET || 'orthobot_secret_key',
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };

    res.json({
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // In a more complex system, you might want to blacklist the token
    // For now, we'll just return success as the frontend will remove the token
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Verify token
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    // Get fresh user data
    const user = await Users.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Token is valid',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
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
