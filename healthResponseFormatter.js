// Health Response Formatter for OrthoBot AI
// Formats responses according to the specified template using existing KB system

class HealthResponseFormatter {
  constructor() {
    this.categories = {
      'courseVideos_kb.json': 'Course Videos',
      'masterclassRecordings_kb.json': 'Masterclasses', 
      'morningExercise_kb.json': 'Morning Exercise & Meditation',
      'sundayWebinar_kb.json': 'Sunday Webinars',
      'rehab_knowledge_base.json': 'Rehabilitation Guide'
    };
  }

  // Extract key information from KB matches
  extractKBInfo(matches) {
    if (!matches || matches.length === 0) return null;

    const topMatch = matches[0];
    const metadata = topMatch.metadata || {};
    
    // Extract proper title from content or metadata
    let title = metadata.title || topMatch.content;
    
    // If title is too long or not descriptive, create a better one
    if (!metadata.title || title.length > 60) {
      if (topMatch.content.includes('6 Weeks Knee Pain Relief')) {
        title = '6 Weeks Knee Pain Relief Challenge Course';
      } else if (topMatch.content.includes('Rameshwar Kumar') || topMatch.content.includes('Dr. Rameshwar')) {
        title = 'Dr. Rameshwar Kumar - Chief Physiotherapist';
      } else if (topMatch.content.includes('Morning Physiotherapy')) {
        title = 'Daily Morning Physiotherapy Session';
      } else if (topMatch.content.includes('exercise') || topMatch.content.includes('व्यायाम')) {
        title = 'Exercise and Rehabilitation Program';
      } else {
        title = topMatch.content.substring(0, 50) + '...';
      }
    }
    
    // Add fallback URL for known content
    let url = metadata.url || null;
    if (!url && topMatch.content.includes('6 Weeks Knee Pain Relief')) {
      url = 'https://www.youtube.com/watch?v=j71zF4ofgr8'; // Introduction video URL from your KB
    }
    
    return {
      title: title,
      summary: metadata.summary || '',
      url: url,
      keywords: metadata.keywords || [],
      content: topMatch.content || '',
      source: metadata.source || topMatch.source || '',
      category: this.categories[metadata.source] || 'General Health',
      similarity: topMatch.similarity || 0
    };
  }

  // Generate structured response using the specified template
  formatHealthResponse(userQuery, kbInfo, aiResponse) {
    // If no KB info found, return conversational response
    if (!kbInfo) {
      return {
        type: 'conversational',
        response: aiResponse,
        hasKBContent: false
      };
    }

    // If it's general conversation, don't use template
    if (this.isGeneralConversation(userQuery)) {
      return {
        type: 'conversational', 
        response: aiResponse,
        hasKBContent: false
      };
    }

    // Check if it's a specific medical/health query
    if (!this.isMedicalQuery(userQuery)) {
      return {
        type: 'conversational',
        response: aiResponse,
        hasKBContent: false
      };
    }

    // Extract plan/steps from content if available
    const steps = this.extractSteps(kbInfo.content);
    const hasStructuredContent = steps.length > 0 || kbInfo.url || kbInfo.summary;

    // Generate structured response
    const structuredResponse = this.generateStructuredResponse(userQuery, kbInfo, steps);
    
    return {
      type: 'structured',
      response: structuredResponse,
      hasKBContent: true,
      kbSource: kbInfo.source,
      category: kbInfo.category
    };
  }

  // Check if query is general conversation
  isGeneralConversation(query) {
    const conversationalKeywords = [

      'hello', 'hi', 'hey', 'how are you', 'what\'s up', 'good morning', 'good evening',
      'can you speak', 'do you understand', 'thank you', 'thanks', 'bye', 'goodbye',
      
      // Hindi/Hinglish greetings and casual phrases
      'namaste', 'kaise ho', 'kya hal hai', 'sab theek', 'theek hai', 'achha', 'good',
      'hindi me', 'english me', 'baat kar', 'bol sakta', 'samjh', 'dhanyawad',
      
      // Casual conversation starters
      'bhai', 'yaar', 'dost', 'sun', 'suno', 'dekh', 'dekho', 'arre', 'arey',
      'kya baat', 'kya kar rahe', 'kahan ho', 'kaise', 'kyun', 'kab', 'kidhar',
      
      // Doctor inquiry (but should be medical if asking about medical expertise)
      'doctor', 'dr', 'kaun hai', 'kon hai', 'who is',
      
      // Very short casual phrases
      'ok', 'okay', 'haan', 'nahi', 'yes', 'no', 'hmm', 'ohh', 'wow', 'nice',
      
      // Common conversation fillers
      'actually', 'basically', 'matlab', 'yani', 'aise', 'vaise', 'phir'
    ];
    
    const lowerQuery = query.toLowerCase().trim();
    
    // Check for conversational keywords first
    const hasConversationalKeywords = conversationalKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // If it has conversational keywords, check if it's also medical
    if (hasConversationalKeywords) {
      // If it also has medical keywords, it's medical (e.g., "morning exercise")
      const hasMedicalKeywords = this.isMedicalQuery(query);
      return !hasMedicalKeywords; // Only conversational if no medical keywords
    }
    
    // Check for very short queries without medical context (likely conversational)
    if (lowerQuery.length <= 8 && !this.isMedicalQuery(query)) {
      return true;
    }
    
    return false;
  }

  // Check if query is specifically about medical/health topics
  isMedicalQuery(query) {
    const medicalKeywords = [
      // Body parts
      'knee', 'back', 'spine', 'shoulder', 'hip', 'ankle', 'wrist', 'neck', 'leg', 'arm',
      'घुटना', 'कमर', 'पीठ', 'कंधा', 'गर्दन', 'पैर', 'हाथ',
      
      // Medical conditions
      'pain', 'dard', 'दर्द', 'ache', 'swelling', 'सूजन', 'injury', 'चोट',
      'surgery', 'operation', 'ऑपरेशन', 'recovery', 'healing', 'ठीक होना',
      
      // Exercises and therapy
      'exercise', 'व्यायाम', 'yoga', 'योग', 'therapy', 'physiotherapy', 'फिजियो',
      'stretching', 'workout', 'movement', 'mobility', 'flexibility',
      'session', 'morning', 'daily', 'routine', 'program', 'course',
      
      // Health-related actions
      'treatment', 'इलाज', 'medicine', 'दवा', 'diet', 'food', 'nutrition', 'आहार',
      'sleep', 'नींद', 'rest', 'आराम', 'walking', 'चलना', 'sitting', 'बैठना',
      
      // Recovery terms
      'heal', 'cure', 'relief', 'राहत', 'better', 'बेहतर', 'improve', 'सुधार',
      'strengthen', 'मजबूत', 'weak', 'कमजोर', 'stiff', 'अकड़न',
      
      // Specific medical queries
      'morning exercise', 'मॉर्निंग एक्सरसाइज', 'post surgery', 'after operation',
      'rehabilitation', 'पुनर्वास', 'physical therapy', 'home remedy', 'घरेलू उपाय',
      
      // Doctor names and medical professionals
      'rameshwar', 'dr rameshwar', 'doctor rameshwar', 'physiotherapist', 'फिजियोथेरेपिस्ट',
      
      // Video/Link requests (medical context)
      'youtube', 'video', 'link', 'वीडियो', 'लिंक', 'देखना', 'watch'
    ];
    
    const lowerQuery = query.toLowerCase();
    return medicalKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  // Extract steps/plan from content
  extractSteps(content) {
    const steps = [];
    
    // Look for numbered lists or structured content
    const lines = content.split('\n');
    let stepCounter = 1;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Match various step patterns
      if (trimmed.match(/^\d+[\.\)]\s+/) || 
          trimmed.match(/^Step\s+\d+/i) ||
          trimmed.match(/^Week\s+\d+/i) ||
          trimmed.match(/^Day\s+\d+/i)) {
        let stepText = trimmed.replace(/^\d+[\.\)]\s+|^Step\s+\d+:?\s*|^Week\s+\d+:?\s*|^Day\s+\d+:?\s*/i, '');
        // Keep steps short - max 80 characters
        if (stepText.length > 80) {
          stepText = stepText.substring(0, 80) + '...';
        }
        steps.push({
          number: stepCounter++,
          text: stepText
        });
      }
    }
    
    // If no structured steps found, create meaningful steps from keywords/content
    if (steps.length === 0) {
      // Try to extract meaningful activities
      const activities = this.extractActivities(content);
      activities.slice(0, 3).forEach((activity, index) => {
        steps.push({
          number: index + 1,
          text: activity
        });
      });
    }
    
    return steps.slice(0, 3); // Limit to 3 steps for readability
  }

  // Extract meaningful activities from content
  extractActivities(content) {
    const activities = [];
    const lowerContent = content.toLowerCase();
    
    // Common exercise/health activities
    const activityPatterns = [
      { pattern: /rameshwar|physiotherapist|doctor/i, text: "Learn from expert physiotherapist guidance" },
      { pattern: /warm.?up|warming up/i, text: "Warm-up exercises and preparation" },
      { pattern: /meditation|mindfulness/i, text: "Meditation and mindfulness practice" },
      { pattern: /stretching|stretch/i, text: "Stretching and flexibility exercises" },
      { pattern: /strengthening|strength/i, text: "Muscle strengthening activities" },
      { pattern: /walking|walk/i, text: "Walking practice and mobility training" },
      { pattern: /breathing|breath/i, text: "Breathing exercises and relaxation" },
      { pattern: /knee.*exercise|leg.*raise/i, text: "Knee and leg strengthening exercises" },
      { pattern: /spine|back.*exercise/i, text: "Spine and back mobility exercises" },
      { pattern: /core.*muscle|core.*exercise/i, text: "Core muscle strengthening" },
      { pattern: /balance|coordination/i, text: "Balance and coordination training" }
    ];
    
    activityPatterns.forEach(pattern => {
      if (pattern.pattern.test(content)) {
        activities.push(pattern.text);
      }
    });
    
    // If no activities found, use generic steps
    if (activities.length === 0) {
      activities.push("Follow the guided instructions");
      activities.push("Practice the recommended exercises");
      activities.push("Maintain consistency for best results");
    }
    
    return activities;
  }

  // Generate the structured response according to template
  generateStructuredResponse(userQuery, kbInfo, steps) {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    
    let response = `💬 **User Query:**\n"${userQuery}"\n\n`;
    response += `🤖 **OrthoBot Response**\n\n`;
    response += `🦵 **${kbInfo.title}**\n\n`;
    
    // Short summary - always generate a concise one
    const shortSummary = this.generateShortSummary(kbInfo.content);
    response += `💡 **Short Summary:**\n${shortSummary}\n\n`;
    
    // KB content snippet - keep it very short
    const snippet = kbInfo.content.substring(0, 100) + (kbInfo.content.length > 100 ? '...' : '');
    response += `📚 **From OrthoBot Knowledge Base:**\n> "${snippet}"\n\n`;
    
    // Course/Plan steps
    if (steps.length > 0) {
      response += `🗓️ **Course / Plan:**\n`;
      steps.forEach((step, index) => {
        const emoji = emojis[index] || `${index + 1}️⃣`;
        response += `${emoji} ${step.text}\n`;
      });
      response += '\n';
    }
    
    // Video/Resource link
    if (kbInfo.url) {
      const linkTitle = kbInfo.title || 'Watch Video';
      response += `🎥 **Watch or Learn More:**\n👉 [${linkTitle}](${kbInfo.url})\n\n`;
    }
    
    // Next step (if available)
    if (kbInfo.keywords && kbInfo.keywords.length > 0) {
      const nextKeyword = kbInfo.keywords[0];
      response += `🎯 **Next Step:**\n👉 Ask me about "${nextKeyword}" for more information\n`;
    }
    
    return response;
  }

  // Generate short summary from content
  generateShortSummary(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) return "Health information and guidance.";
    
    const firstSentence = sentences[0].trim();
    // Keep summary very short - max 50 characters
    return firstSentence.length > 50 ? 
      firstSentence.substring(0, 50) + '...' : 
      firstSentence + '.';
  }

  // Format response for different languages
  formatForLanguage(response, language) {
    if (language === 'hindi' || language === 'hinglish') {
      // Add Hindi context while keeping structure
      return response.replace('🤖 **OrthoBot Response**', '🤖 **OrthoBot का जवाब**');
    }
    return response;
  }
}

module.exports = HealthResponseFormatter;
