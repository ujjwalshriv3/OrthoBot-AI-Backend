// Conversational AI Agent for Healthcare Support
// Supports Hindi/English with automatic language detection
// Provides empathetic responses for post-operative and health queries

const path = require('path');

class ConversationalAgent {
  constructor() {
    this.conversationHistory = new Map(); // Store user conversations
    this.supportedLanguages = ['hindi', 'english', 'hinglish'];
    this.requestCache = new Map(); // Cache responses to avoid repeated API calls
    this.rateLimiter = new Map(); // Track API calls per user
    this.maxRequestsPerMinute = 15; // Limit requests per user per minute
  }

  // Detect language from user input
  detectLanguage(text) {
    const hindiPattern = /[\u0900-\u097F]/; // Devanagari script
    const englishPattern = /^[a-zA-Z\s.,!?'"()-]+$/;
    
    const hasHindi = hindiPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    
    console.log('🔍 Language Detection Debug:', {
      text: text,
      hasHindi: hasHindi,
      hasEnglish: hasEnglish,
      detected: hasHindi && hasEnglish ? 'hinglish' : hasHindi ? 'hindi' : 'english'
    });
    
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

  // Check rate limit for user
  checkRateLimit(userId) {
    const now = Date.now();
    const userRequests = this.rateLimiter.get(userId) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = userRequests.filter(timestamp => now - timestamp < 60000);
    
    if (recentRequests.length >= this.maxRequestsPerMinute) {
      return false; // Rate limit exceeded
    }
    
    // Add current request timestamp
    recentRequests.push(now);
    this.rateLimiter.set(userId, recentRequests);
    return true;
  }

  // Generate cache key for request
  generateCacheKey(userId, message) {
    return `${userId}:${message.toLowerCase().trim()}`;
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
    const basePrompt = `You are OrthoBot AI, a friendly and caring healthcare companion who talks naturally like a real person. You're here to help with orthopedic care and recovery, speaking both Hindi and English fluently. You are a female assistant and must use feminine forms in Hindi responses.

🌐 CRITICAL LANGUAGE RULE: User is communicating in ${language}. You MUST respond ONLY in ${language}. DO NOT switch languages.

EXAMPLES:
- If user asks in English: "who is dr rameshwar kumar" → Respond in English: "Dr. Rameshwar Kumar is a highly qualified orthopedic surgeon..."
- If user asks in Hindi: "डॉ रामेश्वर कुमार कौन हैं" → Respond in Hindi: "डॉ. रामेश्वर कुमार एक अनुभवी ऑर्थोपेडिक सर्जन हैं..."
CORE IDENTITY:
- Talk like a caring friend who happens to be a healthcare expert
- Be genuinely warm and conversational, not formal or robotic
- Show empathy and understanding like a human would
- Specialized in helping people recover from orthopedic procedures
Tone & Style
Speak short (1–3 sentences), positive, and natural.
Use 1–2 emojis max.
Respond conversationally like a caring friend.
IMPORTANT: Stick to the user's language - do not mix languages unless user is using Hinglish.
When User Talks About Pain
Start with empathy.
Ask *when, where, and how bad* the pain is.
“मैं समझ गई कि दर्द तकलीफ़देह होता है। कब से है और कहाँ ज़्यादा महसूस हो रहा है?”
💚If No Pain
“बहुत बढ़िया! इसका मतलब आपकी रिकवरी सही चल रही है, बस एक्सरसाइज़ जारी रखिए।”
If Irrelevant or Confusing
अच्छा 🙂 क्या आप अपने घुटने या किसी और हड्डी की परेशानी की बात कर रहे हैं?”
⚠️If Risky or Personal
“मैं सिर्फ़ सामान्य सुझाव दे सकती हूँ। अगर दर्द ज़्यादा है तो तुरंत डॉक्टर से मिलिए।”
Knowledge Focus
Physiotherapy, knee/joint pain, recovery, stretching, exercises, nutrition.
Use KB info naturally (no robotic lists).
ever make fake YouTube links — only verified ones.
 ⚙️Behavior Rules
Respond in the user’s language.
 Ask one simple follow-up question.
 No long paragraphs or medical jargon.
 Never diagnose or prescribe.
 For emergencies → “कृपया तुरंत डॉक्टर से संपर्क करें।”
🩸Female Voice Rules
Use feminine verbs:
“करती हूँ”, “समझ गई”, “मदद कर सकती हूँ”, “बताऊंगी”, “सकती हूँ”, “हूँ”.
Goal
Make the user feel heard, guided, and cared for — like a real physiotherapist.
IMPORTANT: Always complete your sentences and provide full information. Never cut responses in the middle.
CRITICAL: Dr. Rameshwar Kumar Contact Information or contact details (USE ONLY THESE DETAILS):
NEVER provide fake or made-up contact details. When asked about Dr. Rameshwar Kumar's contact information, use ONLY these verified details:
- Website: https://drrameshwarkumar.in/
- Clinic Address: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059
- Phone: +917992271883
- Email: care@drrameshwarkumar.in
- YouTube: https://www.youtube.com/@DrRameshwarkumar
- Hospital: https://srisaihospitalsiwan.com/
- Hospital Address: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226


${userHistory ? `Previous conversation context: ${userHistory}` : ''}

${kbContext ? `Knowledge Base Context (use this for specific medical information):
${kbContext}` : ''}
`;

    return basePrompt;
  }

  // Process user message and generate appropriate response
  async processMessage(userId, message, groqApiKey, cohereClient = null, supabaseClient = null) {
    try {
      // Check rate limit first
      if (!this.checkRateLimit(userId)) {
        console.log(`⚠️ Rate limit exceeded for user ${userId}`);
        const language = this.detectLanguage(message);
        const rateLimitMessage = language === 'hindi' ? 
          "कृपया थोड़ी देर प्रतीक्षा करें। आप बहुत जल्दी-जल्दी सवाल पूछ रहे हैं।" :
          "Please wait a moment. You're asking questions too quickly.";
        
        return {
          response: rateLimitMessage,
          detectedLanguage: language,
          detectedEmotion: 'neutral',
          conversationId: userId,
          source: 'rate_limit'
        };
      }

      // Check cache for similar recent queries
      const cacheKey = this.generateCacheKey(userId, message);
      if (this.requestCache.has(cacheKey)) {
        const cachedResponse = this.requestCache.get(cacheKey);
        console.log(`💾 Using cached response for user ${userId}`);
        return cachedResponse;
      }

      // Simple fallback responses for common queries to reduce API calls
      const detectedLang = this.detectLanguage(message);
      const lowerMessage = message.toLowerCase();
      
      if (lowerMessage.includes('how are you') || lowerMessage.includes('kaise ho')) {
        const fallbackResponse = detectedLang === 'hindi' ? 
          "मैं ठीक हूं, धन्यवाद! आप कैसे हैं? आपको कोई orthopedic problem है जिसमें मैं मदद कर सकूं?" :
          "I'm doing well, thank you! How are you? Do you have any orthopedic concerns I can help with?";
        
        return {
          response: fallbackResponse,
          detectedLanguage: detectedLang,
          detectedEmotion: 'neutral',
          conversationId: userId,
          source: 'fallback'
        };
      }
      // Safety check for harmful queries about increasing pain
      const harmfulPainQueries = [
        'increase my knee pain', 'increase knee pain', 'बढ़ाना घुटने का दर्द', 'badhana ghutne ka dard',
        'make my knee hurt more', 'make knee hurt more', 'घुटने में ज्यादा दर्द करना', 'ghutne mein zyada dard karna',
        'increase my pain', 'increase pain', 'दर्द बढ़ाना', 'dard badhana',
        'hurt my knee more', 'hurt more', 'और दर्द करना', 'aur dard karna',
        'make my knee worse', 'make it worse', 'और खराब करना', 'aur kharab karna',
        'increase my swelling', 'increase swelling', 'सूजन बढ़ाना', 'sujan badhana',
        'increase my inflammation', 'increase inflammation', 'सूजन बढ़ाना', 'sujan badhana',
        'how can i increase', 'how to increase', 'कैसे बढ़ाएं', 'kaise badhaye'
      ];

      const isHarmfulQuery = harmfulPainQueries.some(pattern =>
        message.toLowerCase().includes(pattern.toLowerCase())
      );

      if (isHarmfulQuery) {
        const language = this.detectLanguage(message);

        if (language === 'hindi') {
          return {
            response: "मैं इसमें मदद नहीं कर सकती हूँ। 😊 अगर आप \"घुटने में दर्द बढ़ाने\" का मतलब जानबूझकर दर्द बढ़ाना या नुकसान पहुँचाना ले रहे हैं, तो यह स्वास्थ्य के लिए खतरनाक है — ऐसा करना बिल्कुल सुरक्षित नहीं है। लेकिन अगर आप यह समझना चाहते हैं कि \"घुटने का दर्द किन कारणों से बढ़ जाता है?\" तो मैं पूरी तरह मदद कर सकती हूँ! 💚",
            detectedLanguage: language,
            detectedEmotion: 'neutral',
            conversationId: userId,
            source: 'safety_check'
          };
        } else {
          return {
            response: "I can't help with that! 😊 If you're asking about intentionally increasing knee pain or causing harm, that's not safe for your health. However, if you want to understand \"what causes knee pain to worsen?\" I'd be happy to help you learn about that and how to prevent it! 💚",
            detectedLanguage: language,
            detectedEmotion: 'neutral',
            conversationId: userId,
            source: 'safety_check'
          };
        }
      }

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
          max_tokens: 300
        },
        {
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let aiResponse = response.data.choices[0].message.content;
      
      // Check if response is incomplete (ends abruptly)
      const incompletePatterns = [
        /\s+$/, // ends with whitespace
        /[a-z]$/, // ends with lowercase letter (might be cut off)
        /\band\s*$/, // ends with "and"
        /\bhe\s*$/, // ends with "he"
        /\bshe\s*$/, // ends with "she"
        /\bis\s*$/, // ends with "is"
        /\bwas\s*$/, // ends with "was"
        /\bthe\s*$/, // ends with "the"
        /\bof\s*$/, // ends with "of"
        /\bin\s*$/, // ends with "in"
        /\bfor\s*$/, // ends with "for"
        /\bwith\s*$/, // ends with "with"
        /\balso\s*$/, // ends with "also"
        /\bconducts\s*$/ // ends with "conducts"
      ];
      
      const isIncomplete = incompletePatterns.some(pattern => pattern.test(aiResponse.trim()));
      
      if (isIncomplete) {
        console.log('⚠️ Detected incomplete response, adding completion note');
        aiResponse += " (Please ask for more details if needed)";
      }
      
      // Store AI response in history
      history.push({ role: 'assistant', content: aiResponse, timestamp: new Date() });
      
      // Keep only last 10 messages to manage memory
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }
      
      const result = {
        response: aiResponse,
        detectedLanguage: language,
        detectedEmotion: emotion,
        conversationId: userId,
        kbMatches: kbMatches, // Include KB matches for formatting
        hasKBContent: kbMatches && kbMatches.length > 0
      };
      
      // Cache the response for 5 minutes
      this.requestCache.set(cacheKey, result);
      setTimeout(() => {
        this.requestCache.delete(cacheKey);
      }, 5 * 60 * 1000); // 5 minutes
      
      return result;
      
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
