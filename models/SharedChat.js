const mongoose = require('mongoose');

const sharedChatSchema = new mongoose.Schema({
  shareId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  shareType: {
    type: String,
    enum: ['full_chat', 'single_message'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  messages: [{
    id: String,
    type: {
      type: String,
      enum: ['user', 'bot']
    },
    text: String,
    timestamp: String
  }],
  singleMessage: {
    id: String,
    type: {
      type: String,
      enum: ['user', 'bot']
    },
    text: String,
    timestamp: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  viewCount: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: { expireAfterSeconds: 0 }
  }
});

module.exports = mongoose.model('SharedChat', sharedChatSchema);
