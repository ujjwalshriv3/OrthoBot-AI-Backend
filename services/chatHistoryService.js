const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');

class ChatHistoryService {
  constructor() {
    this.activeChats = new Map(); // In-memory storage for active chat sessions
  }

  /**
   * Create a new chat session
   */
  async createNewChat(userId, title = null, sessionType = 'text_chat') {
    try {
      const chatTitle = title || this.generateChatTitle();
      
      const newChat = await ChatHistory.createNewChat(userId, chatTitle, sessionType);
      
      console.log(`✅ Created new chat: ${newChat.chatId} for user: ${userId}`);
      return {
        chatId: newChat.chatId,
        title: newChat.title,
        sessionType: newChat.sessionType,
        isVoiceSession: newChat.isVoiceSession,
        createdAt: newChat.createdAt
      };
    } catch (error) {
      console.error('❌ Error creating new chat:', error);
      throw error;
    }
  }

  /**
   * Add a message to an existing chat
   */
  async addMessageToChat(chatId, role, content, userId = null) {
    try {
      let chat = await ChatHistory.findOne({ chatId });
      
      // If chat doesn't exist and we have userId, create new chat
      if (!chat && userId) {
        const title = this.extractTitleFromMessage(content, role);
        chat = await ChatHistory.createNewChat(userId, title);
      }
      
      if (!chat) {
        throw new Error('Chat not found and no userId provided to create new chat');
      }

      await chat.addMessage(role, content);
      
      console.log(`✅ Added ${role} message to chat: ${chatId}`);
      return {
        success: true,
        chatId: chat.chatId,
        messageCount: chat.messages.length
      };
    } catch (error) {
      console.error('❌ Error adding message to chat:', error);
      throw error;
    }
  }

  /**
   * Get user's chat history list
   */
  async getUserChatHistory(userId, limit = 20, skip = 0) {
    try {
      const chats = await ChatHistory.getUserChats(userId, limit, skip);
      
      return {
        success: true,
        chats: chats.map(chat => ({
          chatId: chat.chatId,
          title: chat.title,
          sessionType: chat.sessionType,
          isVoiceSession: chat.isVoiceSession,
          totalMessages: chat.metadata.totalMessages,
          lastMessageAt: chat.metadata.lastMessageAt,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt
        })),
        total: chats.length
      };
    } catch (error) {
      console.error('❌ Error fetching user chat history:', error);
      throw error;
    }
  }

  /**
   * Get full chat conversation
   */
  async getChatConversation(chatId, userId = null) {
    try {
      const query = { chatId, isActive: true };
      if (userId) {
        query.userId = userId;
      }

      const chat = await ChatHistory.findOne(query);
      
      if (!chat) {
        return { success: false, error: 'Chat not found' };
      }

      return {
        success: true,
        chat: {
          chatId: chat.chatId,
          title: chat.title,
          sessionType: chat.sessionType,
          isVoiceSession: chat.isVoiceSession,
          messages: chat.messages,
          metadata: chat.metadata,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt
        }
      };
    } catch (error) {
      console.error('❌ Error fetching chat conversation:', error);
      throw error;
    }
  }

  /**
   * Update chat title
   */
  async updateChatTitle(chatId, newTitle, userId = null) {
    try {
      const query = { chatId };
      if (userId) {
        query.userId = userId;
      }

      const chat = await ChatHistory.findOneAndUpdate(
        query,
        { title: newTitle, updatedAt: new Date() },
        { new: true }
      );

      if (!chat) {
        return { success: false, error: 'Chat not found' };
      }

      return {
        success: true,
        chatId: chat.chatId,
        title: chat.title
      };
    } catch (error) {
      console.error('❌ Error updating chat title:', error);
      throw error;
    }
  }

  /**
   * Delete a chat
   */
  async deleteChat(chatId, userId = null) {
    try {
      const query = { chatId };
      if (userId) {
        query.userId = userId;
      }

      const result = await ChatHistory.findOneAndUpdate(
        query,
        { isActive: false, updatedAt: new Date() },
        { new: true }
      );

      if (!result) {
        return { success: false, error: 'Chat not found' };
      }

      return {
        success: true,
        message: 'Chat deleted successfully'
      };
    } catch (error) {
      console.error('❌ Error deleting chat:', error);
      throw error;
    }
  }

  /**
   * Save voice conversation to chat history
   */
  async saveVoiceConversationToHistory(userId, conversationHistory, sessionMetadata = {}) {
    try {
      const title = this.extractVoiceCallTitle(conversationHistory, sessionMetadata);
      
      const newChat = await ChatHistory.create({
        userId,
        title,
        sessionType: 'voice_call',
        isVoiceSession: true,
        messages: conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date()
        })),
        metadata: {
          detectedLanguage: sessionMetadata.detectedLanguage || 'english',
          primaryTopics: sessionMetadata.primaryTopics || [],
          patientCondition: sessionMetadata.patientCondition
        }
      });

      console.log(`✅ Saved voice conversation to chat history: ${newChat.chatId}`);
      return {
        success: true,
        chatId: newChat.chatId,
        title: newChat.title
      };
    } catch (error) {
      console.error('❌ Error saving voice conversation:', error);
      throw error;
    }
  }

  /**
   * Get or create active chat for user
   */
  async getOrCreateActiveChat(userId) {
    try {
      // Check if user has an active chat in memory
      if (this.activeChats.has(userId)) {
        const activeChatId = this.activeChats.get(userId);
        const chat = await ChatHistory.findOne({ chatId: activeChatId, isActive: true });
        if (chat) {
          return {
            chatId: chat.chatId,
            title: chat.title,
            isNew: false
          };
        }
      }

      // Create new chat
      const newChat = await this.createNewChat(userId);
      this.activeChats.set(userId, newChat.chatId);
      
      return {
        ...newChat,
        isNew: true
      };
    } catch (error) {
      console.error('❌ Error getting or creating active chat:', error);
      throw error;
    }
  }

  /**
   * Generate chat title from message content
   */
  extractTitleFromMessage(content, role) {
    if (role !== 'user') return 'New Chat';
    
    // Extract meaningful keywords for title
    const keywords = content.toLowerCase().match(/\b(pain|surgery|recovery|knee|back|shoulder|hip|exercise|therapy|medication|wound|walking|mobility)\b/g);
    
    if (keywords && keywords.length > 0) {
      const primaryKeyword = keywords[0];
      return `Chat about ${primaryKeyword}`;
    }
    
    // Fallback to first few words
    const words = content.split(' ').slice(0, 4).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  }

  /**
   * Extract voice call title with enhanced intent detection
   */
  extractVoiceCallTitle(conversationHistory, sessionMetadata = {}) {
    // Use primary topics from session metadata if available
    if (sessionMetadata.primaryTopics && sessionMetadata.primaryTopics.length > 0) {
      const primaryTopic = sessionMetadata.primaryTopics[0];
      return `Voice Call: ${primaryTopic}`;
    }

    // Analyze first few user messages for intent
    const userMessages = conversationHistory
      .filter(msg => msg.role === 'user')
      .slice(0, 3)
      .map(msg => msg.content.toLowerCase())
      .join(' ');

    const intentPatterns = {
      'Knee Recovery': ['knee', 'घुटना', 'knee ka dard', 'knee pain', 'knee surgery', 'घुटने में दर्द'],
      'Back Pain Relief': ['back', 'spine', 'कमर', 'kamar', 'back pain', 'कमर दर्द', 'spine pain'],
      'Shoulder Rehabilitation': ['shoulder', 'कंधा', 'shoulder pain', 'कंधे में दर्द', 'shoulder surgery'],
      'Hip Recovery': ['hip', 'कूल्हा', 'hip pain', 'hip surgery', 'कूल्हे में दर्द'],
      'Post-Surgery Care': ['surgery', 'operation', 'post-op', 'सर्जरी', 'ऑपरेशन', 'after surgery'],
      'Pain Management': ['pain', 'दर्द', 'hurt', 'ache', 'painful', 'दुखता है'],
      'Exercise & Therapy': ['exercise', 'therapy', 'व्यायाम', 'physiotherapy', 'workout', 'movement'],
      'Wound Care': ['wound', 'cut', 'stitches', 'घाव', 'bandage', 'healing'],
      'Recovery Timeline': ['recovery', 'heal', 'time', 'when', 'कब तक', 'ठीक होना'],
      'Return to Activities': ['work', 'activity', 'normal', 'daily', 'routine', 'काम पर वापस'],
      'Medication Questions': ['medicine', 'medication', 'दवा', 'pills', 'tablet', 'dose'],
      'Sleep & Rest': ['sleep', 'rest', 'नींद', 'आराम', 'sleeping', 'bed rest'],
      'Walking & Mobility': ['walk', 'walking', 'चलना', 'mobility', 'move', 'movement']
    };

    // Score each intent based on keyword frequency
    let bestIntent = 'Session';
    let maxScore = 0;

    for (const [intent, keywords] of Object.entries(intentPatterns)) {
      let score = 0;
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = userMessages.match(regex);
        if (matches) {
          score += matches.length;
        }
      });

      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    }

    return `Voice Call: ${bestIntent}`;
  }

  /**
   * Generate default chat title
   */
  generateChatTitle() {
    const now = new Date();
    return `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  /**
   * Clear user's active chat from memory
   */
  clearActiveChat(userId) {
    this.activeChats.delete(userId);
  }

  /**
   * Get chat statistics for user
   */
  async getChatStats(userId) {
    try {
      const totalChats = await ChatHistory.countDocuments({ userId, isActive: true });
      const voiceChats = await ChatHistory.countDocuments({ userId, isActive: true, isVoiceSession: true });
      const textChats = totalChats - voiceChats;

      const recentChat = await ChatHistory.findOne({ userId, isActive: true })
        .sort({ updatedAt: -1 })
        .select('updatedAt');

      return {
        success: true,
        stats: {
          totalChats,
          textChats,
          voiceChats,
          lastChatAt: recentChat?.updatedAt || null
        }
      };
    } catch (error) {
      console.error('❌ Error fetching chat stats:', error);
      throw error;
    }
  }
}

module.exports = ChatHistoryService;
