const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
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
  messageId: {
    type: String,
    default: () => require('uuid').v4()
  }
});

const chatHistorySchema = new mongoose.Schema({
  chatId: {
    type: String,
    unique: true,
    required: true,
    default: () => require('uuid').v4()
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  messages: [messageSchema],
  sessionType: {
    type: String,
    enum: ['text_chat', 'voice_call'],
    default: 'text_chat'
  },
  isVoiceSession: {
    type: Boolean,
    default: false
  },
  metadata: {
    totalMessages: {
      type: Number,
      default: 0
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    },
    detectedLanguage: {
      type: String,
      default: 'english'
    },
    primaryTopics: [{
      type: String
    }],
    patientCondition: {
      type: String
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
chatHistorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.metadata.totalMessages = this.messages.length;
  if (this.messages.length > 0) {
    this.metadata.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
  }
  next();
});

// Index for efficient queries
chatHistorySchema.index({ userId: 1, createdAt: -1 });
chatHistorySchema.index({ userId: 1, isActive: 1, updatedAt: -1 });
// Note: chatId index is already created by unique: true in schema definition

// Methods for the schema
chatHistorySchema.methods.addMessage = function(role, content) {
  this.messages.push({
    role,
    content,
    timestamp: new Date()
  });
  return this.save();
};

chatHistorySchema.methods.generateTitle = function() {
  if (this.messages.length === 0) return 'New Chat';
  
  const firstUserMessage = this.messages.find(msg => msg.role === 'user');
  if (!firstUserMessage) return 'New Chat';
  
  // Extract meaningful title from first user message
  let title = firstUserMessage.content.substring(0, 50);
  if (firstUserMessage.content.length > 50) {
    title += '...';
  }
  
  // Clean up title
  title = title.replace(/[^\w\s]/gi, '').trim();
  
  return title || 'New Chat';
};

chatHistorySchema.statics.getUserChats = function(userId, limit = 20, skip = 0) {
  return this.find({ userId, isActive: true })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('chatId title sessionType isVoiceSession metadata createdAt updatedAt');
};

chatHistorySchema.statics.createNewChat = function(userId, title, sessionType = 'text_chat') {
  return this.create({
    userId,
    title,
    sessionType,
    isVoiceSession: sessionType === 'voice_call'
  });
};

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
