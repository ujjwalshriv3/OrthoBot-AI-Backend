const VoiceSession = require('../models/VoiceSession');
const ConversationalAgent = require('../conversationalAgent');

class VoiceSessionService {
  constructor() {
    this.conversationalAgent = new ConversationalAgent();
  }

  // Start a new voice session or resume existing one
  async startVoiceSession(userId, sessionType = 'voice_call') {
    try {
      const session = await VoiceSession.findOrCreateSession(userId, sessionType);
      await session.startCall();
      
      return {
        sessionId: session.sessionId,
        isNewSession: session.stats.totalCalls === 1,
        context: session.getContextSummary(),
        preferences: session.preferences
      };
    } catch (error) {
      console.error('Error starting voice session:', error);
      throw new Error('Failed to start voice session');
    }
  }

  // End current voice session
  async endVoiceSession(sessionId) {
    try {
      const session = await VoiceSession.findOne({ sessionId });
      if (session) {
        await session.endCall();
        return {
          sessionId: session.sessionId,
          duration: session.stats.lastCallDuration,
          totalCalls: session.stats.totalCalls
        };
      }
      return null;
    } catch (error) {
      console.error('Error ending voice session:', error);
      throw new Error('Failed to end voice session');
    }
  }

  // Process message with session context
  async processMessageWithContext(sessionId, userMessage, groqApiKey) {
    try {
      const session = await VoiceSession.findOne({ sessionId });
      if (!session) {
        throw new Error('Session not found');
      }

      // Detect language and emotion
      const language = this.conversationalAgent.detectLanguage(userMessage);
      const emotion = this.conversationalAgent.detectEmotion(userMessage);

      // Add user message to session
      await session.addMessage('user', userMessage, language, emotion);

      // Get session context for enhanced prompt
      const contextSummary = session.getContextSummary();
      
      // Generate enhanced system prompt with session memory
      const enhancedPrompt = this.generateSessionAwarePrompt(language, emotion, contextSummary, session.preferences);

      // Get AI response using conversational agent with session context
      const conversationContext = this.buildConversationContext(session);
      const response = await this.getAIResponseWithMemory(enhancedPrompt, userMessage, conversationContext, groqApiKey);

      // Add AI response to session
      await session.addMessage('assistant', response, language, 'neutral');

      // Update session context based on conversation
      await this.updateSessionContext(session, userMessage, response, language);

      return {
        response,
        detectedLanguage: language,
        detectedEmotion: emotion,
        sessionContext: session.getContextSummary(),
        isActive: session.isActive
      };

    } catch (error) {
      console.error('Error processing message with context:', error);
      throw new Error('Failed to process message');
    }
  }

  // New: Handle a single voice message with full conversation memory in system prompt
  async handleVoiceMessage(sessionId, userMessage, groqApiKey) {
    try {
      const axios = require('axios');
      const session = await VoiceSession.findOne({ sessionId });
      if (!session) {
        throw new Error('Session not found');
      }

      // 1) Detect language/emotion and add user message to session
      const language = this.conversationalAgent.detectLanguage(userMessage);
      const emotion = this.conversationalAgent.detectEmotion(userMessage);
      await session.addMessage('user', userMessage, language, emotion);

      // 2) Use conversational agent with Dr. Rameshwar KB support
      const conversationalResult = await this.conversationalAgent.processMessage(
        sessionId, 
        userMessage, 
        groqApiKey,
        null, // cohere client - not needed for Dr. Rameshwar KB
        null  // supabase client - not needed for Dr. Rameshwar KB
      );

      const aiResponse = conversationalResult.response;

      // 5) Store bot response into session
      await session.addMessage('assistant', aiResponse, language, 'neutral');

      // 6) Return response (and some metadata) for TTS playback
      return {
        response: aiResponse,
        detectedLanguage: language,
        detectedEmotion: emotion,
        sessionContext: session.getContextSummary(),
        isActive: session.isActive
      };
    } catch (error) {
      console.error('Error handling voice message:', error);
      throw new Error('Failed to handle voice message');
    }
  }

  // Generate session-aware system prompt
  generateSessionAwarePrompt(language, emotion, contextSummary, preferences) {
    const callHistory = contextSummary.callHistory.totalCalls > 1 ? 
      `This is call #${contextSummary.callHistory.totalCalls} with this user. Previous calls averaged ${contextSummary.callHistory.averageDuration} seconds.` : 
      'This is the first call with this user.';

    const topicContext = contextSummary.primaryTopics.length > 0 ? 
      `Previous topics discussed: ${contextSummary.primaryTopics.join(', ')}. Current focus: ${contextSummary.currentTopic || 'General consultation'}.` : 
      'No previous conversation history.';

    const patientContext = contextSummary.patientCondition ? 
      `Patient condition: ${contextSummary.patientCondition}. Recovery stage: ${contextSummary.recoveryStage || 'Not specified'}.` : 
      'Patient condition not yet established.';

    const concernsContext = contextSummary.recentConcerns.length > 0 ? 
      `Recent concerns: ${contextSummary.recentConcerns.join(', ')}.` : 
      'No specific concerns noted yet.';

    const recentConversation = contextSummary.recentConversation ? 
      `Recent conversation context:\n${contextSummary.recentConversation}` : 
      'No recent conversation history.';

    return `You are OrthoBot AI, a caring healthcare companion with PERFECT MEMORY of ALL conversations during this call. You NEVER forget anything the user tells you.

COMPLETE CONVERSATION MEMORY:
${recentConversation}

MEMORY CONTEXT:
${callHistory}
${topicContext}
${patientContext}
${concernsContext}

CRITICAL MEMORY RULES:
- You have PERFECT RECALL of EVERYTHING said in this call
- NEVER say "I don't remember" or "I forgot" - you remember EVERYTHING
- Reference specific details from ANY point in this conversation
- If user asks about something they mentioned earlier, recall it EXACTLY
- Remember names, treatments, doctors, symptoms, dates - ALL details
- Show you remember by referencing specific things they told you

CORE IDENTITY:
- You REMEMBER this user and reference previous conversations naturally
- Talk like a caring friend who knows their medical history
- Show continuity by referencing past discussions when relevant
- Be genuinely warm and conversational, not formal or robotic
- Specialized in orthopedic care and recovery

LANGUAGE HANDLING:
- User is communicating in: ${language}
- Respond naturally in the SAME language as the user
- User prefers: ${preferences.preferredLanguage}
- Communication style: ${preferences.communicationStyle}

EMOTIONAL INTELLIGENCE:
- User's current emotional state: ${emotion}
- Show genuine empathy and understanding
- Use warm, caring, and supportive tone
- Acknowledge their feelings and reference past concerns if relevant

CONVERSATION STYLE:
- Reference previous conversations when appropriate ("Last time we talked about...")
- Show you remember their condition and progress
- Ask follow-up questions based on previous discussions
- Be ${preferences.responseLength === 'brief' ? 'concise and direct' : 'detailed and thorough'}
- Sound like you're continuing a relationship, not starting fresh
- Use natural, flowing conversational language like ChatGPT
- Avoid formal or robotic language patterns

MEDICAL EXPERTISE FOCUS:
- Post-operative care and recovery
- Orthopedic rehabilitation exercises  
- Pain management techniques
- Wound care and healing
- Mobility and physical therapy guidance
- When to contact healthcare providers
- Medication adherence support

SAFETY PROTOCOLS:
- Always include medical disclaimers when giving advice
- Recognize emergency symptoms and advise immediate medical care
- Never diagnose or prescribe medications
- Encourage professional medical consultation when needed

RESPONSE FORMAT:
- Keep responses SHORT and conversational (1-3 sentences max for voice calls)
- Reference previous conversations when relevant
- Ask ONE direct question about their current situation
- Show continuity and memory of their journey
- For voice calls: Be concise and natural, like talking to a friend you know well
- Use empathetic, warm language that shows you remember them`;
  }

  // Build conversation context from session history
  buildConversationContext(session) {
    const allHistory = session.conversationHistory; // Get ALL messages during current call
    const conversationMessages = [];
    
    console.log('📚 Building conversation context:', {
      totalHistoryMessages: allHistory.length,
      sessionId: session.sessionId
    });
    
    // Add ALL conversation history to maintain complete context
    allHistory.forEach((msg, index) => {
      conversationMessages.push({
        role: msg.role,
        content: msg.content
      });
      console.log(`💬 Message ${index + 1}: ${msg.role} - ${msg.content.substring(0, 50)}...`);
    });
    
    return conversationMessages;
  }

  // Get AI response with enhanced memory context
  async getAIResponseWithMemory(systemPrompt, userMessage, conversationContext, groqApiKey) {
    try {
      const axios = require('axios');
      
      // Build messages array with conversation history
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationContext // Include previous conversation
      ];
      
      // Don't add the current user message again since it's already in conversationContext
      // Only add it if conversationContext is empty
      if (conversationContext.length === 0) {
        messages.push({ role: 'user', content: userMessage });
      }
      
      console.log('🧠 Sending to AI with conversation history:', {
        totalMessages: messages.length,
        historyMessages: conversationContext.length,
        lastFewMessages: messages.slice(-3)
      });
      
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          temperature: 0.7,
          max_tokens: 200
        },
        {
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error getting AI response:', error);
      throw error;
    }
  }

  // Update session context based on conversation
  async updateSessionContext(session, userMessage, aiResponse, language) {
    try {
      const contextUpdate = this.extractContextFromConversation(userMessage, aiResponse);
      
      // Update primary topics
      if (contextUpdate.topic) {
        if (!session.sessionContext.primaryTopics.includes(contextUpdate.topic)) {
          session.sessionContext.primaryTopics.push(contextUpdate.topic);
        }
        session.sessionContext.currentTopic = contextUpdate.topic;
      }

      // Update patient condition and concerns
      if (contextUpdate.condition) {
        session.sessionContext.patientCondition = contextUpdate.condition;
      }

      if (contextUpdate.concerns && contextUpdate.concerns.length > 0) {
        session.sessionContext.concerns = [
          ...new Set([...session.sessionContext.concerns, ...contextUpdate.concerns])
        ].slice(-10); // Keep last 10 concerns
      }

      if (contextUpdate.symptoms && contextUpdate.symptoms.length > 0) {
        session.sessionContext.lastDiscussedSymptoms = contextUpdate.symptoms;
      }

      // Update preferences
      if (language !== session.preferences.preferredLanguage) {
        session.preferences.preferredLanguage = language;
      }

      await session.updateContext(session.sessionContext);
    } catch (error) {
      console.error('Error updating session context:', error);
    }
  }

  // Extract context information from conversation
  extractContextFromConversation(userMessage, aiResponse) {
    const lowerMessage = userMessage.toLowerCase();
    const context = {
      topic: null,
      condition: null,
      concerns: [],
      symptoms: []
    };

    // Extract topics
    const topicPatterns = {
      'knee recovery': ['knee', 'knee pain', 'knee surgery', 'knee replacement'],
      'back pain relief': ['back pain', 'back injury', 'spine', 'lower back'],
      'shoulder rehabilitation': ['shoulder', 'shoulder pain', 'shoulder surgery'],
      'hip replacement care': ['hip', 'hip replacement', 'hip surgery', 'hip pain'],
      'post-operative care': ['post-op', 'after surgery', 'post surgery', 'recovery'],
      'exercise guidance': ['exercise', 'workout', 'physical therapy', 'stretching'],
      'pain management': ['pain relief', 'manage pain', 'reduce pain', 'medication'],
      'wound care': ['wound', 'incision', 'stitches', 'healing', 'scar']
    };

    for (const [topic, keywords] of Object.entries(topicPatterns)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        context.topic = topic;
        break;
      }
    }

    // Extract concerns
    const concernPatterns = ['worried', 'concerned', 'afraid', 'scared', 'anxious', 'problem', 'issue'];
    concernPatterns.forEach(pattern => {
      if (lowerMessage.includes(pattern)) {
        context.concerns.push(pattern);
      }
    });

    // Extract symptoms
    const symptomPatterns = ['pain', 'swelling', 'stiffness', 'numbness', 'tingling', 'weakness', 'ache'];
    symptomPatterns.forEach(symptom => {
      if (lowerMessage.includes(symptom)) {
        context.symptoms.push(symptom);
      }
    });

    return context;
  }

  // Get session information
  async getSessionInfo(sessionId) {
    try {
      const session = await VoiceSession.findOne({ sessionId });
      if (!session) {
        return null;
      }

      return {
        sessionId: session.sessionId,
        userId: session.userId,
        isActive: session.isActive,
        context: session.getContextSummary(),
        preferences: session.preferences,
        stats: session.stats,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt
      };
    } catch (error) {
      console.error('Error getting session info:', error);
      return null;
    }
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions() {
    try {
      const deletedCount = await VoiceSession.cleanupExpiredSessions();
      console.log(`Cleaned up ${deletedCount} expired voice sessions`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  // Get user's session history
  async getUserSessions(userId, limit = 10) {
    try {
      const sessions = await VoiceSession.find({ userId })
        .sort({ lastActiveAt: -1 })
        .limit(limit)
        .select('sessionId sessionType stats createdAt lastActiveAt sessionContext.primaryTopics');

      return sessions.map(session => ({
        sessionId: session.sessionId,
        sessionType: session.sessionType,
        primaryTopics: session.sessionContext.primaryTopics || [],
        totalCalls: session.stats.totalCalls,
        totalDuration: session.stats.totalDuration,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt
      }));
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }
}

module.exports = VoiceSessionService;
