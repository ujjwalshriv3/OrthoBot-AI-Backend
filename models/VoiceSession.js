const mongoose = require('mongoose');

// Voice Session Schema for persistent memory across voice calls
const voiceSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  // Session metadata
  sessionType: {
    type: String,
    enum: ['voice_call', 'elevenlabs_convai'],
    default: 'voice_call'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Conversation memory
  conversationHistory: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    language: {
      type: String,
      enum: ['english', 'hindi', 'hinglish'],
      default: 'english'
    },
    emotion: {
      type: String,
      enum: ['neutral', 'worried', 'pain', 'frustrated', 'sad', 'hopeful'],
      default: 'neutral'
    }
  }],
  
  // Session context and topics
  sessionContext: {
    primaryTopics: [String], // e.g., ['knee recovery', 'post-operative care']
    currentTopic: String,
    patientCondition: String, // e.g., 'post knee surgery recovery'
    recoveryStage: String, // e.g., 'week 2 post-op'
    concerns: [String], // ongoing patient concerns
    recommendations: [String], // previous recommendations given
    followUpNeeded: Boolean,
    lastDiscussedSymptoms: [String]
  },
  
  // Language and communication preferences
  preferences: {
    preferredLanguage: {
      type: String,
      enum: ['english', 'hindi', 'hinglish'],
      default: 'english'
    },
    communicationStyle: {
      type: String,
      enum: ['formal', 'casual', 'empathetic'],
      default: 'empathetic'
    },
    responseLength: {
      type: String,
      enum: ['brief', 'detailed'],
      default: 'brief'
    }
  },
  
  // Session statistics
  stats: {
    totalCalls: {
      type: Number,
      default: 1
    },
    totalDuration: {
      type: Number,
      default: 0
    }, // in seconds
    averageCallDuration: {
      type: Number,
      default: 0
    },
    lastCallDuration: {
      type: Number,
      default: 0
    },
    messageCount: {
      type: Number,
      default: 0
    }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  callStartedAt: {
    type: Date
  },
  callEndedAt: {
    type: Date
  },
  
  // Session expires when call ends (immediate deletion)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour max call duration as safety
  }
});

// Indexes for performance
voiceSessionSchema.index({ userId: 1, lastActiveAt: -1 });
voiceSessionSchema.index({ sessionType: 1, isActive: 1 });
voiceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods
voiceSessionSchema.methods.startCall = function() {
  // Only increment call count if this is a new call (not resuming)
  if (!this.isActive) {
    this.stats.totalCalls += 1;
    this.callStartedAt = new Date();
  }
  this.isActive = true;
  this.lastActiveAt = new Date();
  return this.save();
};

voiceSessionSchema.methods.endCall = async function() {
  this.isActive = false;
  this.callEndedAt = new Date();
  
  if (this.callStartedAt) {
    const duration = Math.floor((this.callEndedAt - this.callStartedAt) / 1000);
    this.stats.lastCallDuration = duration;
    this.stats.totalDuration += duration;
    this.stats.averageCallDuration = Math.floor(this.stats.totalDuration / this.stats.totalCalls);
  }
  
  // Delete the session immediately when call ends to forget user conversation
  return this.deleteOne();
};

voiceSessionSchema.methods.addMessage = function(role, content, language = 'english', emotion = 'neutral') {
  this.conversationHistory.push({
    role,
    content,
    timestamp: new Date(),
    language,
    emotion
  });
  
  this.stats.messageCount += 1;
  this.lastActiveAt = new Date();
  
  // Keep conversation history during active call (no limit during call)
  // Memory will be cleared when call ends
  
  return this.save();
};

voiceSessionSchema.methods.updateContext = function(contextUpdate) {
  this.sessionContext = { ...this.sessionContext, ...contextUpdate };
  this.lastActiveAt = new Date();
  return this.save();
};

voiceSessionSchema.methods.getRecentHistory = function(limit = 10) {
  // Return ALL conversation history during active call for complete memory
  return this.conversationHistory;
};

voiceSessionSchema.methods.getContextSummary = function() {
  const context = this.sessionContext;
  const allMessages = this.conversationHistory; // Get ALL messages, not just recent 5
  
  return {
    primaryTopics: context.primaryTopics || [],
    currentTopic: context.currentTopic,
    patientCondition: context.patientCondition,
    recoveryStage: context.recoveryStage,
    recentConcerns: context.concerns || [],
    lastSymptoms: context.lastDiscussedSymptoms || [],
    recentConversation: allMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n'), // Include ALL conversation
    callHistory: {
      totalCalls: this.stats.totalCalls,
      averageDuration: this.stats.averageCallDuration
    }
  };
};

// Static methods
voiceSessionSchema.statics.findOrCreateSession = async function(userId, sessionType = 'voice_call') {
  // Always create a completely new session for each call (no memory between calls)
  const sessionId = `voice_${userId}_${Date.now()}`;
  const session = new this({
    sessionId,
    userId,
    sessionType,
    conversationHistory: [],
    sessionContext: {
      primaryTopics: [],
      concerns: [],
      recommendations: [],
      lastDiscussedSymptoms: []
    }
  });
  await session.save();
  
  return session;
};

voiceSessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  return result.deletedCount;
};

module.exports = mongoose.model('VoiceSession', voiceSessionSchema);
