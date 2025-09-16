// Conversational AI Agent for Healthcare Support
// Supports Hindi/English with automatic language detection
// Provides empathetic responses for post-operative and health queries

class ConversationalAgent {
  constructor() {
    this.conversationHistory = new Map(); // Store user conversations
    this.supportedLanguages = ['hindi', 'english', 'hinglish'];
  }

  // Detect language from user input
  detectLanguage(text) {
    const hindiPattern = /[\u0900-\u097F]/; // Devanagari script
    const englishPattern = /^[a-zA-Z\s.,!?'"()-]+$/;
    
    const hasHindi = hindiPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasHindi && hasEnglish) return 'hinglish';
    if (hasHindi) return 'hindi';
    return 'english';
  }

  // Get empathetic greeting based on language
  getGreeting(language, userName = null) {
    const greetings = {
      hindi: `हैलो! मैं OrthoBot हूं। मैं आपकी orthopedic recovery में help करने के लिए यहां हूं। आपको क्या problem है?`,
      english: `Hello! I'm OrthoBot AI, your orthopedic recovery assistant. I'm here to help you with your post-operative recovery journey. What can I help you with today?`,
      hinglish: `हैलो! मैं OrthoBot हूं। मैं आपकी orthopedic recovery में help करने के लिए यहां हूं। आपको क्या problem है?`
    };
    
    return greetings[language] || greetings.english;
  }

  // Generate empathetic response based on user's emotional state
  getEmpatheticResponse(emotion, language, context) {
    const responses = {
      hindi: {
        worried: [
          "अच्छा, tension mat लो। क्या problem है?",
          "हां, चिंता natural है। बताओ क्या हुआ?",
          "ठीक है, मैं हूं help के लिए।"
        ],
        pain: [
          "अच्छा pain है? कहां और कैसा?",
          "हां दर्द परेशान करता है। कब से?",
          "ओके, pain की details बताओ।"
        ],
        frustrated: [
          "समझ गया, frustrating है। क्या issue है?",
          "हां mushkil time है। बताओ problem।"
        ]
      },
      english: {
        worried: [
          "Okay, don't worry. What's wrong?",
          "Yeah, that's normal. What happened?",
          "Alright, I'm here to help."
        ],
        pain: [
          "Oh, you have pain? Where and how?",
          "Pain sucks. Since when?",
          "Okay, tell me about the pain."
        ],
        frustrated: [
          "I get it, that's frustrating. What's the issue?",
          "Yeah, tough time. What's the problem?"
        ]
      }
    };

    const langResponses = responses[language] || responses.english;
    const emotionResponses = langResponses[emotion] || langResponses.worried;
    
    return emotionResponses[Math.floor(Math.random() * emotionResponses.length)];
  }

  // Detect emotional context from user message
  detectEmotion(text) {
    const emotionKeywords = {
      worried: ['worried', 'चिंतित', 'परेशान', 'डर', 'afraid', 'scared', 'anxious'],
      pain: ['pain', 'दर्द', 'hurt', 'ache', 'सूजन', 'swelling', 'uncomfortable'],
      frustrated: ['frustrated', 'परेशान', 'angry', 'गुस्सा', 'irritated', 'fed up'],
      sad: ['sad', 'उदास', 'depressed', 'down', 'low'],
      hopeful: ['better', 'बेहतर', 'improving', 'good', 'अच्छा', 'positive']
    };

    const lowerText = text.toLowerCase();
    
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
        return emotion;
      }
    }
    
    return 'neutral';
  }

  // Enhanced system prompt for bilingual healthcare conversations
  generateSystemPrompt(language, emotion, userHistory) {
    const basePrompt = `You are OrthoBot AI, a friendly and caring healthcare companion who talks naturally like a real person. You're here to help with orthopedic care and recovery, speaking both Hindi and English fluently.

CORE IDENTITY:
- Talk like a caring friend who happens to be a healthcare expert
- Be genuinely warm and conversational, not formal or robotic
- Specialized in helping people recover from orthopedic procedures
- Show real empathy and understanding like a human would

LANGUAGE HANDLING:
- User is communicating in: ${language}
- Respond naturally in the SAME language as the user
- For Hinglish, flow naturally between Hindi and English
- Never be formal or translate unless asked - just talk naturally

EMOTIONAL INTELLIGENCE:
- User's current emotional state: ${emotion}
- Show genuine empathy and understanding
- Use warm, caring, and supportive tone
- Acknowledge their feelings before providing medical guidance
- Be patient and encouraging throughout the conversation

CONVERSATION STYLE:
- Talk like a caring friend and healthcare professional, not a robot
- Use natural, flowing conversational language like ChatGPT assistant
- Be warm, personable, and genuinely caring in your responses
- Ask follow-up questions naturally to understand better
- Provide guidance in a conversational, easy-to-understand manner
- Show personality while maintaining professionalism
- Use appropriate cultural context and expressions for Hindi speakers
- Avoid formal or robotic language patterns
- Sound like you're having a real conversation, not reading from a script

MEDICAL EXPERTISE FOCUS:
- Post-operative care and recovery
- Orthopedic rehabilitation exercises  
- Pain management techniques
- Wound care and healing
- Mobility and physical therapy guidance
- When to contact healthcare providers
- Medication adherence support

SAFETY PROTOCOLS:
- Always include medical disclaimers
- Recognize emergency symptoms and advise immediate medical care
- Never diagnose or prescribe medications
- Encourage professional medical consultation when needed
- Provide evidence-based general guidance only

RESPONSE FORMAT:
- Keep responses VERY SHORT and conversational (1-3 sentences max)
- Ask ONE direct question about their specific problem
- Don't give explanations unless specifically asked
- Focus on understanding their issue first with follow-up questions
- Respond like Siri - brief, helpful, and to the point
- Get straight to the point, absolutely no fluff or long paragraphs
- For voice calls: Be even more concise and natural, like talking to a friend
- Use empathetic, warm language that sounds human, not robotic
- Show genuine care and understanding in your tone

${userHistory ? `Previous conversation context: ${userHistory}` : ''}
`;

    return basePrompt;
  }

  // Process user message and generate appropriate response
  async processMessage(userId, message, groqApiKey) {
    try {
      // Detect language and emotion
      const language = this.detectLanguage(message);
      const emotion = this.detectEmotion(message);
      
      // Get or create conversation history
      if (!this.conversationHistory.has(userId)) {
        this.conversationHistory.set(userId, []);
      }
      
      const history = this.conversationHistory.get(userId);
      const userHistory = history.slice(-5).map(h => `${h.role}: ${h.content}`).join('\n');
      
      // Generate system prompt
      const systemPrompt = this.generateSystemPrompt(language, emotion, userHistory);
      

      // Store user message in history
      history.push({ role: 'user', content: message, timestamp: new Date() });
      
      // Make API call to Groq
      const axios = require('axios');
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 150
        },
        {
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      
      // Store AI response in history
      history.push({ role: 'assistant', content: aiResponse, timestamp: new Date() });
      
      // Keep only last 10 messages to manage memory
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }
      
      return {
        response: aiResponse,
        detectedLanguage: language,
        detectedEmotion: emotion,
        conversationId: userId
      };
      
    } catch (error) {
      console.error('Error in conversational agent:', error);
      
      // Return error message in detected language
      const language = this.detectLanguage(message);
      const errorMessages = {
        hindi: "माफ करें, मुझे कुछ तकनीकी समस्या हो रही है। कृपया थोड़ी देर बाद कोशिश करें।",
        english: "I'm sorry, I'm experiencing some technical difficulties. Please try again in a moment.",
        hinglish: "Sorry, mujhe kuch technical problem ho rahi hai. Please thoda wait karke try kijiye."
      };
      
      return {
        response: errorMessages[language] || errorMessages.english,
        detectedLanguage: language,
        error: true
      };
    }
  }

  // Get conversation history for a user
  getConversationHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  // Clear conversation history for a user
  clearConversationHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  // Get conversation statistics
  getConversationStats(userId) {
    const history = this.conversationHistory.get(userId) || [];
    const languages = history.map(h => this.detectLanguage(h.content));
    const emotions = history.map(h => this.detectEmotion(h.content));
    
    return {
      totalMessages: history.length,
      languageDistribution: this.getDistribution(languages),
      emotionDistribution: this.getDistribution(emotions),
      lastActivity: history.length > 0 ? history[history.length - 1].timestamp : null
    };
  }

  // Helper function to get distribution
  getDistribution(array) {
    return array.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {});
  }
}

module.exports = ConversationalAgent;
