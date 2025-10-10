// Conversational AI Agent for Healthcare Support
// Supports Hindi/English with automatic language detection
// Provides empathetic responses for post-operative and health queries

const path = require('path');

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

  // Generate system prompt based on language and emotion
  generateSystemPrompt(language, emotion, userHistory = '', kbContext = '') {
    const basePrompt = `You are OrthoBot AI, a friendly and caring healthcare companion who talks naturally like a real person. You're here to help with orthopedic care and recovery, speaking both Hindi and English fluently.
CORE IDENTITY:
- Talk like a caring friend who happens to be a healthcare expert
- Be genuinely warm and conversational, not formal or robotic
- Show empathy and understanding like a human would
- Specialized in helping people recover from orthopedic procedures

LANGUAGE HANDLING:
- User is communicating in: ${language}
- Respond naturally in the SAME language as the user
- For Hinglish, flow naturally between Hindi and English
- Never be formal or translate unless asked - just talk naturally

CONVERSATION FLOW:
- For general conversation (like "can you speak Hindi", "how are you", etc.): Respond conversationally without using knowledge base
- For specific medical questions (exercises, pain relief, treatments, food advice, etc.): ALWAYS use knowledge base context if available
- If knowledge base context is provided, extract relevant information and present it conversationally
- Always be conversational first, but use KB data when available for medical queries

CONVERSATION STYLE:
- Keep responses SHORT and conversational (1-3 sentences max)
- Ask follow-up questions to understand their needs
- Don't give medical explanations unless specifically asked
- Focus on understanding their issue first
- Respond like talking to a friend - brief, helpful, and natural
- Use empathetic, warm language that sounds human, not robotic
- Use appropriate cultural context and expressions for Hindi speakers
- Avoid formal or robotic language patterns
- Sound like you're having a real conversation, not reading from a script

EXAMPLES:
- User: "Hindi me bat kr skta h bhai" → Response: "Haan bilkul bhai! Main Hindi aur English dono mein baat kar sakta hun. Aap comfortable feel karo. Kya help chahiye aapko?"
- User: "knee pain exercises" → Use KB context for specific exercises and videos
- User: "which food is useful" → Use KB context for nutrition advice and food recommendations
- User: "how are you" → "Main theek hun, thank you! Aap kaise hain? Koi problem hai jo main help kar sakun?"

IMPORTANT: If KB context contains relevant information (videos, exercises, food advice), ALWAYS use it and present conversationally.
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

🚨 CRITICAL YOUTUBE LINK WARNING:
❌ NEVER EVER create fake YouTube links like youtu.be/randomID or youtube.com/watch?v=fakeID
❌ NEVER generate random YouTube video IDs or URLs
❌ If you don't have the exact YouTube link from the knowledge base, DO NOT provide any YouTube link
❌ Only use verified YouTube links or say "I don't have that specific video link"

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

${kbContext ? `Knowledge Base Context (use this for specific medical information):
${kbContext}` : ''}
`;

    return basePrompt;
  }

  // Process user message and generate appropriate response
  async processMessage(userId, message, groqApiKey, cohereClient = null, supabaseClient = null) {
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
      
      // 🔍 Try Dr. Rameshwar KB first, then general KB
      let kbContext = "";
      let kbMatches = null;
      
      // First check Dr. Rameshwar specific KB
      try {
        const path = require('path');
        const drRameshwarKB = require(path.join(__dirname, 'Dr_kbs', 'drRameshwar_kb.json'));
        const lowerQuery = message.toLowerCase();
        
        // Check if query is about Dr. Rameshwar
        console.log('🔍 Voice Call Query:', lowerQuery);
        if (lowerQuery.includes('rameshwar') || lowerQuery.includes('रामेश्वर') || 
            lowerQuery.includes('doctor') || lowerQuery.includes('डॉक्टर') ||
            lowerQuery.includes('course') || lowerQuery.includes('कोर्स') ||
            lowerQuery.includes('experience') || lowerQuery.includes('अनुभव') ||
            lowerQuery.includes('hospital') || lowerQuery.includes('अस्पताल') ||
            lowerQuery.includes('contact') || lowerQuery.includes('संपर्क')) {
          
          console.log('🎯 Dr. Rameshwar keywords detected in voice call!');
          
          const drKB = drRameshwarKB.knowledgeBase.DrRameshwar;
          
          // Contact related queries
          if (lowerQuery.includes('contact') || lowerQuery.includes('phone') || 
              lowerQuery.includes('number') || lowerQuery.includes('email') || 
              lowerQuery.includes('address') || lowerQuery.includes('clinic')) {
            kbContext = `${drKB.contact.title}\n${drKB.contact.content}`;
            console.log('🎯 Dr. Rameshwar contact info found for voice call');
          }
          // About Dr. Rameshwar queries
          else if (lowerQuery.includes('who') || lowerQuery.includes('कौन') || 
                   lowerQuery.includes('about') || lowerQuery.includes('बारे')) {
            kbContext = `${drKB.profile.title}\n${drKB.profile.content}`;
            console.log('🎯 Dr. Rameshwar profile info found for voice call');
          }
          // Experience related queries
          else if (lowerQuery.includes('experience') || lowerQuery.includes('अनुभव') ||
                   lowerQuery.includes('years') || lowerQuery.includes('साल')) {
            kbContext = `${drKB.achievements.title}\n${drKB.achievements.content}`;
            console.log('🎯 Dr. Rameshwar experience info found for voice call');
          }
          // Hospital related queries
          else if (lowerQuery.includes('hospital') || lowerQuery.includes('अस्पताल')) {
            kbContext = `${drKB.hospital.title}\n${drKB.hospital.content}`;
            console.log('🎯 Dr. Rameshwar hospital info found for voice call');
          }
          // Course/Mission related queries
          else if (lowerQuery.includes('course') || lowerQuery.includes('कोर्स') || 
                   lowerQuery.includes('mission') || lowerQuery.includes('मिशन')) {
            kbContext = `${drKB.mission.title}\n${drKB.mission.content}`;
            console.log('🎯 Dr. Rameshwar mission info found for voice call');
          }
          // Default Dr. Rameshwar info
          else {
            kbContext = `${drKB.profile.title}\n${drKB.profile.content}\n\n${drKB.achievements.title}\n${drKB.achievements.content}`;
            console.log('🎯 Dr. Rameshwar general info found for voice call');
          }
        }
      } catch (drKBError) {
        console.error('❌ Dr. Rameshwar KB error:', drKBError.message);
        console.error('❌ Current directory:', __dirname);
        console.error('❌ Looking for KB at:', path.join(__dirname, 'Dr_kbs', 'drRameshwar_kb.json'));
      }
      
      // If no Dr. Rameshwar KB match, try general Supabase KB
      if (!kbContext && cohereClient && supabaseClient) {
        try {
          console.log('🔍 Conversational Agent: Searching KB with Cohere embeddings...');
          
          // Create embedding for user message
          const embeddingResponse = await cohereClient.embed({
            model: "embed-english-v3.0",
            texts: [message],
            inputType: "search_query"
          });
          const userEmbedding = embeddingResponse.embeddings[0];

          // Search in Supabase
          const { data: matches, error } = await supabaseClient.rpc("match_documents", {
            query_embedding: userEmbedding,
            match_threshold: 0.3,
            match_count: 5,  // Get more matches
          });
          
          if (!error && matches && matches.length > 0) {
            kbMatches = matches; // Store matches for formatting
            kbContext = matches.map(m => m.content).join("\n");
            console.log(`📊 Conversational Agent: Found ${matches.length} KB matches`);
            console.log(`📝 KB Context length: ${kbContext.length} characters`);
            console.log(`🎯 Top match similarity: ${matches[0].similarity}`);
          } else {
            console.log('❌ No KB matches found or error occurred');
          }
        } catch (kbError) {
          console.error('❌ Conversational Agent KB search failed:', kbError);
        }
      } else {
        console.log('⚠️ Cohere or Supabase client not provided to conversational agent');
      }
      
      // Generate system prompt with KB context
      console.log('📝 Final KB Context length:', kbContext.length);
      console.log('📝 KB Context preview:', kbContext.substring(0, 200));
      const systemPrompt = this.generateSystemPrompt(language, emotion, userHistory, kbContext);
      

      // Store user message in history
      history.push({ role: 'user', content: message, timestamp: new Date() });
      
      // Make API call to Groq
      const axios = require('axios');
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',  // Updated to stable model
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
        conversationId: userId,
        kbMatches: kbMatches, // Include KB matches for formatting
        hasKBContent: kbMatches && kbMatches.length > 0
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
