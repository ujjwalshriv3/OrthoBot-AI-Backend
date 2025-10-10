const port = process.env.PORT || 3000;
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Groq } = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');
const { CohereClient } = require('cohere-ai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Clean OrthoBot Response Formatter
function formatOrthoResponse(userQuery, kbInfo, aiResponse) {
  console.log('🎯 Using actual AI response for query:', userQuery);
  console.log('📝 AI Response length:', aiResponse?.length || 0);
  console.log('📚 KB Info:', kbInfo?.title || 'No title');
  console.log('🔗 KB URL:', kbInfo?.url || 'No URL in KB');
  
  // Detect if user query is in Hindi
  const isHindiQuery = /[\u0900-\u097F]/.test(userQuery) || 
    userQuery.toLowerCase().includes('hindi') ||
    userQuery.toLowerCase().includes('bhai') ||
    userQuery.toLowerCase().includes('kon') ||
    userQuery.toLowerCase().includes('kya') ||
    userQuery.toLowerCase().includes('kaise') ||
    userQuery.toLowerCase().includes('dikha') ||
    userQuery.toLowerCase().includes('batao') ||
    userQuery.toLowerCase().includes('kaun') ||
    userQuery.toLowerCase().includes('hai');
  
  // Detect if user query is specifically in English
  const isEnglishQuery = userQuery.toLowerCase().includes('who is') ||
    userQuery.toLowerCase().includes('what is') ||
    userQuery.toLowerCase().includes('tell me about') ||
    userQuery.toLowerCase().includes('about dr') ||
    userQuery.toLowerCase().includes('dr rameshwar kumar') ||
    (!isHindiQuery && /^[a-zA-Z\s?.,!]+$/.test(userQuery));
  
  console.log('🌐 Language detected - Hindi:', isHindiQuery, 'English:', isEnglishQuery, 'for query:', userQuery);

    
  
  // Use the actual AI response as base, but enhance it with KB info
  let finalResponse = aiResponse || 'मुझे खुशी होगी आपकी मदद करने में। कृपया अपना सवाल पूछें।';
  
  // Add KB title and summary if available
  if (kbInfo?.title) {
    let title = kbInfo.title;
    
    // Clean up technical terms from title
    title = title.replace(/courseVideos_kb\.json/gi, '')
                 .replace(/courseTitle/gi, '')
                 .replace(/\.json/gi, '')
                 .replace(/_kb/gi, '')
                 .replace(/kb_/gi, '')
                 .replace(/\s+>/g, '')
                 .replace(/>\s+/g, '')
                 .trim();
    
    // Convert technical titles to user-friendly ones
    if (title.includes('6 Weeks Knee Pain Relief')) {
      title = isEnglishQuery ? '6 Weeks Knee Pain Relief Challenge Course' : '6 सप्ताह घुटने के दर्द से राहत चुनौती कोर्स';
    } else if (title.includes('Rameshwar Kumar') || title.includes('Dr. Rameshwar')) {
      title = isEnglishQuery ? 'Dr. Rameshwar Kumar - Chief Physiotherapist' : 'डॉ. रामेश्वर कुमार - मुख्य फिजियोथेरेपिस्ट';
    } else if (title.includes('Morning Physiotherapy')) {
      title = isEnglishQuery ? 'Daily Morning Physiotherapy Session' : 'दैनिक सुबह फिजियोथेरेपी सत्र';
    } else if (title.toLowerCase().includes('course') || title.toLowerCase().includes('video')) {
      title = isEnglishQuery ? 'Knee Health Education' : 'घुटने के स्वास्थ्य की जानकारी';
    } else if (title.toLowerCase().includes('masterclass')) {
      title = isEnglishQuery ? 'Expert Masterclass Session' : 'विशेषज्ञ मास्टरक्लास सत्र';
    } else if (title.toLowerCase().includes('webinar')) {
      title = isEnglishQuery ? 'Health Education Webinar' : 'स्वास्थ्य शिक्षा वेबिनार';
    }
    
    // Only add title if it's meaningful and not empty
    if (title && title.length > 2) {
      finalResponse = `🦵 ${title}\n\n${finalResponse}`;
    }
  }
  
  // Add context-specific summary for Dr. Rameshwar
  if (kbInfo?.content && (kbInfo.content.includes('Rameshwar') || userQuery.toLowerCase().includes('rameshwar'))) {
    if (isEnglishQuery) {
      const rameshwarSummary = `Dr. Rameshwar Kumar is an expert physiotherapist and Chief Physiotherapist who conducts daily morning exercise sessions for knee health. He specializes in home-based exercises, rehabilitation programs, and provides comprehensive guidance for knee pain relief.

👨‍⚕️ Dr. Rameshwar Kumar is also an experienced orthopedic and joint replacement surgeon with over 18 years of practice. He has earned MBBS, MS, DNB, and M.Ch (Ortho) degrees.

🏥 His Achievements:
• 20,000+ orthopedic and joint replacement surgeries
• 150+ free surgeries for poor people
• Trained 7,000+ health workers in first aid
• Conducted 300+ health camps in villages
• Consulted 7+ lakh patients
• 10+ million social media reach

🎯 Founder of Save The Knee Mission:
Dr. Rameshwar realized he could help people heal from knee pain without surgery or medications. He developed Miracle MP rituals and dedicated his life to serving people through natural healing methods. He offers personalized coaching, evidence-based treatment approaches, and helps patients avoid surgery through natural healing methods. His morning sessions include physiotherapy exercises, meditation, and holistic wellness approaches for orthopedic conditions.

🏢 Legal Entity: Shreesai Hospital & Trauma Center Private Limited
📍 Address: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226

📞 Contact Details:
• Website: https://drrameshwarkumar.in/
• Clinic Address: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059
• Phone: +917992271883
• Email: care@drrameshwarkumar.in
• YouTube: https://www.youtube.com/@DrRameshwarkumar
• Hospital: https://srisaihospitalsiwan.com/`;
      finalResponse += `\n\n📋 About Dr. Rameshwar Kumar:\n${rameshwarSummary}`;
    } else {
      const rameshwarSummary = `डॉ. रामेश्वर कुमार एक विशेषज्ञ फिजियोथेरेपिस्ट और मुख्य फिजियोथेरेपिस्ट हैं जो घुटने के स्वास्थ्य के लिए दैनिक सुबह व्यायाम सत्र आयोजित करते हैं। वे घर-आधारित व्यायाम, पुनर्वास कार्यक्रमों में विशेषज्ञ हैं और घुटने के दर्द से राहत के लिए व्यापक मार्गदर्शन प्रदान करते हैं।

👨‍⚕️ डॉ. रामेश्वर कुमार एक अनुभवी ऑर्थोपेडिक और जॉइंट रिप्लेसमेंट सर्जन भी हैं जो 18 साल से अधिक समय से प्रैक्टिस कर रहे हैं। उन्होंने MBBS, MS, DNB, और M.Ch (Ortho) की डिग्री हासिल की है।

🏥 उनकी उपलब्धियां:
• 20,000+ ऑर्थोपेडिक और जॉइंट रिप्लेसमेंट सर्जरी
• 150+ गरीब लोगों के लिए मुफ्त सर्जरी
• 7,000+ स्वास्थ्य कर्मचारियों को प्राथमिक चिकित्सा का प्रशिक्षण
• 300+ गांवों में स्वास्थ्य शिविर
• 7 लाख+ मरीजों को परामर्श
• 10 मिलियन+ सोशल मीडिया रीच

🎯 Save The Knee Mission के संस्थापक:
डॉ. रामेश्वर ने महसूस किया कि वे बिना सर्जरी और दवाओं के घुटने के दर्द से राहत दिला सकते हैं। उन्होंने Miracle MP rituals विकसित किए और अपना जीवन लोगों की सेवा में समर्पित कर दिया। वे व्यक्तिगत कोचिंग, साक्ष्य-आधारित उपचार दृष्टिकोण प्रदान करते हैं और रोगियों को प्राकृतिक उपचार विधियों के माध्यम से सर्जरी से बचने में मदद करते हैं।

🏢 कानूनी इकाई: Shreesai Hospital & Trauma Center Private Limited
📍 पता: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226

📞 संपर्क विवरण:
• वेबसाइट: https://drrameshwarkumar.in/
• क्लिनिक पता: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059
• फोन: +917992271883
• ईमेल: care@drrameshwarkumar.in
• YouTube: https://www.youtube.com/@DrRameshwarkumar
• अस्पताल: https://srisaihospitalsiwan.com/`;
      finalResponse += `\n\n📋 डॉ. रामेश्वर कुमार के बारे में:\n${rameshwarSummary}`;
    }
  }
  // Add summary from KB if available and different from AI response (for other content)
  else if (kbInfo?.summary && !finalResponse.includes(kbInfo.summary.substring(0, 50))) {
    let summary = kbInfo.summary;
    if (summary.length > 300) {
      summary = summary.substring(0, 300) + '...';
    }
    finalResponse += `\n\n📋 ${isEnglishQuery ? 'Key Information:' : 'मुख्य जानकारी:'}\n${summary}`;
  }
  
  // Get video URL from KB first, then fallback to mapping
  let videoUrl = kbInfo?.url;
  
  // If no URL in KB, try to find relevant URL based on content and query
  if (!videoUrl && kbInfo?.content) {
    const content = kbInfo.content.toLowerCase();
    const query = userQuery.toLowerCase();
    console.log('🔍 Searching for video URL based on content and query...');
    
    // Course Videos KB URLs (Complete List)
    if (content.includes('6 weeks') || content.includes('course') || query.includes('course')) {
      videoUrl = 'https://www.youtube.com/watch?v=j71zF4ofgr8'; // Introduction Video
    } else if (content.includes('basic knowledge') || query.includes('basic')) {
      videoUrl = 'https://www.youtube.com/watch?v=wwm4waoO3oU'; // Basic Knowledge Series
    } else if (content.includes('causes') || content.includes('कारण')) {
      videoUrl = 'https://www.youtube.com/watch?v=MXmS5ED87T0'; // Main Causes Of Knee Pain
    } else if (content.includes('symptoms') || content.includes('लक्षण')) {
      videoUrl = 'https://www.youtube.com/watch?v=bAzw-3FX3z0'; // Symptoms Of Cartilage Damage
    } else if (content.includes('diagnosis') || content.includes('निदान')) {
      videoUrl = 'https://www.youtube.com/watch?v=2cETcxcr4q4'; // How to confirm diagnosis
    } else if (content.includes('arthritis grade') || content.includes('womac')) {
      videoUrl = 'https://www.youtube.com/watch?v=fMvqaPRe8KM'; // Knee arthritis grade and WOMAC score
    } else if (content.includes('treatment') || content.includes('इलाज')) {
      videoUrl = 'https://www.youtube.com/watch?v=78IMjmNQQY0'; // Treatment options
    } else if (content.includes('call to action') || content.includes('activities')) {
      videoUrl = 'https://www.youtube.com/watch?v=zMRj8CF0n3s'; // Call To Action
    } else if (content.includes('pain management') || query.includes('pain management')) {
      videoUrl = 'https://www.youtube.com/watch?v=MIElsmWZKHc'; // Pain Management Module
    } else if (content.includes('medicine') || content.includes('दवा')) {
      videoUrl = 'https://www.youtube.com/watch?v=oO859kzPkao'; // Medicine knowledge
    } else if (content.includes('home remedies') || content.includes('घरेलू')) {
      videoUrl = 'https://www.youtube.com/watch?v=4L7aNdpuw3w'; // Home remedies
    } else if (content.includes('hot') || content.includes('cold') || content.includes('therapy')) {
      videoUrl = 'https://www.youtube.com/watch?v=MIVp_V-Dre4'; // Hot or cold therapy
    } else if (content.includes('severe pain') || content.includes('अत्यधिक दर्द')) {
      videoUrl = 'https://www.youtube.com/watch?v=dSkjl5wgMG0'; // Severe Pain Relief Exercises
    } else if (content.includes('diet') || content.includes('food') || content.includes('आहार')) {
      videoUrl = 'https://www.youtube.com/watch?v=8LsPh3TEbdk'; // Diet and foods
    } else if (content.includes('painkiller') || content.includes('complication')) {
      videoUrl = 'https://www.youtube.com/watch?v=7oAiIWlUDjk'; // Painkiller complications
    } else if (content.includes('call to action') && content.includes('pain')) {
      videoUrl = 'https://www.youtube.com/watch?v=02pVUTdFYYo'; // Pain Management Call to Action
    } else if (content.includes('early stage') || content.includes('exercise') || content.includes('व्यायाम')) {
      videoUrl = 'https://www.youtube.com/watch?v=9mS9jm54dlE'; // Early Stage Exercise
    } else if (content.includes('sitting') || content.includes('बैठना') || content.includes('ground')) {
      videoUrl = 'https://www.youtube.com/watch?v=8mln2vJLLis'; // How to sit on ground
    } else if (content.includes('pillow') || content.includes('तकिया')) {
      videoUrl = 'https://www.youtube.com/watch?v=AiJ9RWdJsoI'; // Exercise with pillow
    } else if (content.includes('daily life') || content.includes('activity')) {
      videoUrl = 'https://www.youtube.com/watch?v=gZSdOWKOpZ4'; // Daily life activities part 1
    } else if (content.includes('stairs') || content.includes('सीढ़ी')) {
      videoUrl = 'https://www.youtube.com/watch?v=kXAvqGgQE6k'; // How to climb stairs
    } else if (content.includes('daily life') && content.includes('part 2')) {
      videoUrl = 'https://www.youtube.com/watch?v=P12kzQFad68'; // Daily life activities part 2
    
    // Morning Exercise KB URLs
    } else if (content.includes('rameshwar') || content.includes('morning') || content.includes('physiotherapy') || query.includes('rameshwar') || query.includes('dr rameshwar')) {
      videoUrl = 'https://www.youtube.com/watch?v=kY1vwF5lpFI'; // Morning Physiotherapy Session
      console.log('🎯 Dr. Rameshwar URL matched!');
    
    // Masterclass KB URLs
    } else if (content.includes('masterclass') || content.includes('मास्टरक्लास') || query.includes('masterclass')) {
      videoUrl = 'https://www.youtube.com/watch?v=gxEHLIe1HPc'; // Live Masterclass
    
    // Sunday Webinar KB URLs (Complete List)
    } else if (content.includes('save the knee mission') || content.includes('understanding knee pain')) {
      videoUrl = 'https://www.youtube.com/watch?v=DmZbT7uO8TU'; // Save the Knee Mission
    } else if (content.includes('webinar 1') || (content.includes('webinar') && content.includes('first'))) {
      videoUrl = 'https://www.youtube.com/watch?v=AYvGeHsOOuk'; // Webinar 1
    } else if (content.includes('webinar 2') || (content.includes('webinar') && content.includes('second'))) {
      videoUrl = 'https://www.youtube.com/watch?v=lD7MbWMmuPM'; // Webinar 2
    } else if (content.includes('webinar 4') || content.includes('joint replacement') || content.includes('replacement')) {
      videoUrl = 'https://www.youtube.com/watch?v=G2Pbfj83MbM'; // Webinar 4 - Joint replacement
    } else if (content.includes('webinar 8') || content.includes('knee replacement')) {
      videoUrl = 'https://www.youtube.com/watch?v=EnZPFC98K9Q'; // Webinar 8
    } else if (content.includes('webinar') || query.includes('webinar')) {
      videoUrl = 'https://www.youtube.com/watch?v=DmZbT7uO8TU'; // Default webinar
    
    // Query-based intent matching for better URL selection
    } else if (query.includes('pain') || query.includes('दर्द') || query.includes('relief')) {
      videoUrl = 'https://www.youtube.com/watch?v=MIElsmWZKHc'; // Pain Management Module
    } else if (query.includes('exercise') || query.includes('व्यायाम') || query.includes('workout')) {
      videoUrl = 'https://www.youtube.com/watch?v=9mS9jm54dlE'; // Early Stage Exercise
    } else if (query.includes('diet') || query.includes('food') || query.includes('आहार') || query.includes('nutrition')) {
      videoUrl = 'https://www.youtube.com/watch?v=8LsPh3TEbdk'; // Diet and foods for knee health
    } else if (query.includes('medicine') || query.includes('दवा') || query.includes('painkiller')) {
      videoUrl = 'https://www.youtube.com/watch?v=oO859kzPkao'; // Medicine knowledge for pain
    } else if (query.includes('home') || query.includes('घरेलू') || query.includes('remedy')) {
      videoUrl = 'https://www.youtube.com/watch?v=4L7aNdpuw3w'; // Home remedies for knee pain
    } else if (query.includes('causes') || query.includes('कारण') || query.includes('why')) {
      videoUrl = 'https://www.youtube.com/watch?v=MXmS5ED87T0'; // Main Causes Of Knee Pain
    } else if (query.includes('symptoms') || query.includes('लक्षण')) {
      videoUrl = 'https://www.youtube.com/watch?v=bAzw-3FX3z0'; // Symptoms Of Cartilage Damage
    } else if (query.includes('treatment') || query.includes('इलाज')) {
      videoUrl = 'https://www.youtube.com/watch?v=78IMjmNQQY0'; // Treatment options
    } else if (query.includes('diagnosis') || query.includes('जांच')) {
      videoUrl = 'https://www.youtube.com/watch?v=2cETcxcr4q4'; // How to confirm diagnosis
    } else if (query.includes('webinar') || query.includes('सेमिनार')) {
      videoUrl = 'https://www.youtube.com/watch?v=DmZbT7uO8TU'; // Save the Knee Mission
    } else if (query.includes('masterclass') || query.includes('मास्टरक्लास')) {
      videoUrl = 'https://www.youtube.com/watch?v=gxEHLIe1HPc'; // Live Masterclass
    } else {
      // Default fallback to Dr. Rameshwar's YouTube playlists
      videoUrl = 'https://www.youtube.com/@DrRameshwarkumar/playlists'; // Dr. Rameshwar YouTube playlists
    }
  }
  
  
  // Add video URL to the AI response if found
  if (videoUrl) {
    console.log('🔗 Adding video URL to response:', videoUrl);
    finalResponse += `\n\n🎥 ${isEnglishQuery ? 'You can watch this helpful video:' : 'इस वीडियो को देखें जो आपकी मदद करेगा:'}\n🔗 ${videoUrl}`;
  } else {
    console.log('❌ No video URL found for query:', userQuery);
  }
  
  // Add helpful next steps based on query context
  if (finalResponse.length < 500) { // Only add if response is short
    if (isEnglishQuery) {
      finalResponse += `\n\n💪 What to do next:\n• Feel free to ask me any other questions\n• Start with small, consistent daily practices\n• Be patient - natural healing takes time\n• Consult your doctor for any concerns`;
      
      finalResponse += `\n\n🌟 Remember: You're not alone in this journey! I'm here to help you every step of the way. Take it one day at a time and keep your knees healthy.`;
    } else {
      finalResponse += `\n\n💪 आगे क्या करें:\n• अगर आपको और जानकारी चाहिए तो मुझसे पूछें\n• रोजाना थोड़ा-थोड़ा अभ्यास करें\n• धैर्य रखें - प्राकृतिक उपचार में समय लगता है\n• किसी भी समस्या के लिए डॉक्टर से सलाह लें`;
      
      finalResponse += `\n\n🌟 याद रखें: आप अकेले नहीं हैं! मैं यहाँ आपकी मदद के लिए हूँ। छोटे-छोटे कदम उठाएं और अपने घुटनों को स्वस्थ रखें।`;
    }
  }
  
  console.log('📝 Final response length:', finalResponse.length);
  console.log('📝 Response includes video URL:', finalResponse.includes('🎥'));
  
  return finalResponse;
}

// This function is no longer needed as we use actual AI responses

// Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Initialize Groq SDK
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Initialize Cohere client
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

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

// Import Health Response Formatter
const HealthResponseFormatter = require('./healthResponseFormatter');
const healthFormatter = new HealthResponseFormatter();

// Import Chat History Service
const ChatHistoryService = require('./services/chatHistoryService');
const chatHistoryService = new ChatHistoryService();

// Import User model
const Users = require('./models/UserSchema');

// Load knowledge base
const kb = JSON.parse(fs.readFileSync('./rehab_knowledge_base.json', 'utf-8'));
const drRameshwarKB = JSON.parse(fs.readFileSync('./Dr_kbs/drRameshwar_kb.json', 'utf-8'));

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

// Search Dr. Rameshwar KB first for any Dr. Rameshwar related queries
function searchDrRameshwarKB(query) {
  const lowerQuery = query.toLowerCase();
  
  // Check if query is about Dr. Rameshwar
  if (lowerQuery.includes('rameshwar') || lowerQuery.includes('dr rameshwar') || 
      lowerQuery.includes('doctor rameshwar') || lowerQuery.includes('rameshwar kumar')) {
    
    const drKB = drRameshwarKB.knowledgeBase.DrRameshwar;
    
    // Contact related queries
    if (lowerQuery.includes('contact') || lowerQuery.includes('phone') || 
        lowerQuery.includes('number') || lowerQuery.includes('email') || 
        lowerQuery.includes('address') || lowerQuery.includes('clinic')) {
      return {
        title: drKB.contact.title,
        content: drKB.contact.content,
        summary: drKB.contact.summary,
        url: 'https://www.youtube.com/@DrRameshwarkumar/playlists' // Dr. Rameshwar YouTube playlists
      };
    }
    
    // Website related queries
    if (lowerQuery.includes('website') || lowerQuery.includes('site') || 
        lowerQuery.includes('youtube') || lowerQuery.includes('online')) {
      return {
        title: drKB.contact.title,
        content: 'Website: https://drrameshwarkumar.in/, Contact Page: https://drrameshwarkumar.in/contact/, YouTube: https://www.youtube.com/@DrRameshwarkumar',
        summary: 'Dr. Rameshwar Kumar official website, contact page and YouTube channel',
        url: 'https://www.youtube.com/@DrRameshwarkumar/playlists' // Dr. Rameshwar YouTube playlists
      };
    }
    
    // Hospital related queries
    if (lowerQuery.includes('hospital') || lowerQuery.includes('clinic') || 
        lowerQuery.includes('location') || lowerQuery.includes('where')) {
      return {
        title: drKB.hospital.title,
        content: drKB.hospital.content,
        summary: drKB.hospital.summary,
        url: 'kY1vwF5lpFI' // Dr. Rameshwar Morning Session video
      };
    }
    
    // General profile queries
    if (lowerQuery.includes('who is') || lowerQuery.includes('about') || 
        lowerQuery.includes('profile') || lowerQuery.includes('kaun hai')) {
      return {
        title: drKB.profile.title,
        content: drKB.profile.content + ' ' + drKB.achievements.content + ' ' + drKB.mission.content,
        summary: drKB.profile.summary,
        url: 'kY1vwF5lpFI' // Dr. Rameshwar Morning Session video
      };
    }
    
    // Default Dr. Rameshwar response
    return {
      title: drKB.profile.title,
      content: drKB.profile.content,
      summary: drKB.profile.summary,
      url: 'kY1vwF5lpFI' // Dr. Rameshwar Morning Session video
    };
  }
  
  return null;
}

// Basic keyword search in KB
function searchKB(query) {
  // First check Dr. Rameshwar KB
  const drResult = searchDrRameshwarKB(query);
  if (drResult) {
    return drResult;
  }
  
  // Then search general KB
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

  // Check for casual greetings first (before any complex processing)
  const casualGreetings = ['hi', 'hello', 'hey', 'hii', 'helo', 'namaste', 'नमस्ते', 'hola', 'good morning', 'good evening', 'good afternoon'];
  const userMsg = userQuestion.toLowerCase().trim();
  console.log(`🔍 OLD ENDPOINT - Checking greeting for: "${userMsg}"`);
  
  const isGreeting = casualGreetings.some(greeting => {
    const match = userMsg === greeting || 
           userMsg.startsWith(greeting + ' ') ||
           userMsg.endsWith(' ' + greeting) ||
           userMsg === greeting + '!' ||
           userMsg === greeting + '.';
    if (match) console.log(`✅ OLD ENDPOINT - Matched greeting: "${greeting}"`);
    return match;
  });
  
  console.log(`🎯 OLD ENDPOINT - Is greeting detected: ${isGreeting}`);
  
  if (isGreeting) {
    console.log('👋 OLD ENDPOINT - Detected greeting, responding with simple welcome message');
    
    const greetingResponse = "Hi! 👋 I'm OrthoBot AI, your friendly assistant for orthopedic recovery and physiotherapy guidance. I'm here to help you with exercises, pain management, rehabilitation tips, and recovery advice. What would you like to know about your recovery journey? 😊";
    
    return res.json({ 
      response: greetingResponse,
      answer: greetingResponse,
      source: 'greeting'
    });
  }

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

🚨 CRITICAL: Dr. Rameshwar Kumar Contact Information (MANDATORY - USE ONLY THESE DETAILS):

WARNING: NEVER EVER provide fake, made-up, or assumed contact details for Dr. Rameshwar Kumar. You MUST use ONLY these verified details:

📞 CONTACT QUERIES - Use these EXACT details:
- Phone: +917992271883
- Email: care@drrameshwarkumar.in
- Clinic Address: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059

🌐 WEBSITE QUERIES - Use this EXACT website:
- Website: https://drrameshwarkumar.in/
- YouTube: https://www.youtube.com/@DrRameshwarkumar

🏥 HOSPITAL QUERIES - Use these EXACT details:
- Hospital Name: Shreesai Hospital & Trauma Center Private Limited
- Hospital Website: https://srisaihospitalsiwan.com/
- Hospital Address: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226

❌ FORBIDDEN: Do NOT mention any other hospitals like 'Delhi Orthopedic Hospital', 'Mumbai hospitals', or any other fake names.
❌ FORBIDDEN: Do NOT provide any other phone numbers, emails, websites, or addresses.
❌ FORBIDDEN: Do NOT make up or assume any information about Dr. Rameshwar Kumar.

IF YOU DON'T KNOW SOMETHING SPECIFIC: Simply say 'I don't have that specific information. Please contact Dr. Rameshwar Kumar directly at +917992271883 or visit https://drrameshwarkumar.in/'

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

// Enhanced askAI endpoint with chat history integration and Supabase vector search
app.post('/api/chat/message', async (req, res) => {
  const { query: userQuestion, userId, chatId, useConversationalAgent = true, source = 'text', sessionId = null } = req.body;
  
  console.log('📥 Received chat message:', { userQuestion, userId, chatId, source, useConversationalAgent, sessionId });

  try {
    console.log('🚀 Starting message processing...');
    // Check for casual greetings first (before any complex processing)
    const casualGreetings = ['hi', 'hello', 'hey', 'hii', 'helo', 'namaste', 'नमस्ते', 'hola', 'good morning', 'good evening', 'good afternoon'];
    const userMsg = userQuestion.toLowerCase().trim();
    console.log(`🔍 Checking greeting for: "${userMsg}"`);
    
    const isGreeting = casualGreetings.some(greeting => {
      const match = userMsg === greeting || 
             userMsg.startsWith(greeting + ' ') ||
             userMsg.endsWith(' ' + greeting) ||
             userMsg === greeting + '!' ||
             userMsg === greeting + '.';
      if (match) console.log(`✅ Matched greeting: "${greeting}"`);
      return match;
    });
    
    console.log(`🎯 Is greeting detected: ${isGreeting}`);
    
    if (isGreeting) {
      console.log('👋 Detected greeting, responding with simple welcome message');
      
      const greetingResponse = "Hi! 👋 I'm OrthoBot AI, your friendly assistant for orthopedic recovery and physiotherapy guidance. I'm here to help you with exercises, pain management, rehabilitation tips, and recovery advice. What would you like to know about your recovery journey? 😊";
      
      // Get or create active chat for greeting
      let activeChatId = chatId;
      if (!activeChatId && userId) {
        const newChat = await chatHistoryService.createNewChat(userId);
        activeChatId = newChat.chatId;
      }
      
      // Add user message and greeting response to chat history
      if (activeChatId && userId) {
        await chatHistoryService.addMessageToChat(activeChatId, 'user', userQuestion, userId);
        await chatHistoryService.addMessageToChat(activeChatId, 'assistant', greetingResponse, userId);
      }
      
      return res.json({ 
        response: greetingResponse,
        answer: greetingResponse,
        chatId: activeChatId,
        source: 'greeting'
      });
    }

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

    // Use conversational agent first for natural conversation
    console.log(`🔄 useConversationalAgent: ${useConversationalAgent}`);
    if (useConversationalAgent) {  // Enable conversational agent first
      try {
        console.log('🤖 Processing with conversational agent...');
        const result = await conversationalAgent.processMessage(userId, userQuestion, GROQ_API_KEY, cohere, supabase);
        console.log('✅ Conversational agent response:', result);
        
        // 🎯 Check if we should use structured health response format
        let finalResponse = result.response;
        let responseType = 'conversational';
        
        if (result.hasKBContent && result.kbMatches) {
          // Extract KB info from matches
          const kbInfo = healthFormatter.extractKBInfo(result.kbMatches);
          
          // Format response using health template
          const formattedResult = healthFormatter.formatHealthResponse(userQuestion, kbInfo, result.response);
          
          if (formattedResult.type === 'structured') {
            // Apply clean formatting prompt
            finalResponse = formatOrthoResponse(userQuestion, kbInfo, result.response);
            responseType = 'structured';
            console.log('📋 Using structured health response format');
            console.log('🎯 Query:', userQuestion);
            console.log('🎯 KB Title:', kbInfo.title);
            console.log('🎯 Formatted Response Preview:', finalResponse.substring(0, 300) + '...');
          } else {
            console.log('❌ Not using structured format for query:', userQuestion);
            console.log('❌ Formatted result type:', formattedResult.type);
          }
        }
        
        // Add bot response to chat history
        if (activeChatId && userId) {
          await chatHistoryService.addMessageToChat(activeChatId, 'assistant', finalResponse, userId);
        }
        
        return res.json({ 
          response: finalResponse,
          answer: finalResponse,
          detectedLanguage: result.detectedLanguage,
          detectedEmotion: result.detectedEmotion,
          conversationId: result.conversationId,
          isConversational: true,
          responseType: responseType,
          hasKBContent: result.hasKBContent,
          chatId: activeChatId
        });
      } catch (error) {
        console.error('❌ Conversational agent error:', error.message);
        console.error('❌ Full error:', error);
        console.log('🔄 Falling back to KB search due to conversational agent error');
        // Fall back to Supabase vector search system
      }
    }

    // NEW: Supabase vector search with Cohere embeddings
    try {
      console.log('🔍 Using Supabase vector search with Cohere embeddings...');
      
      // 1️⃣ Create embedding for user message
      const embeddingResponse = await cohere.embed({
        model: "embed-english-v3.0",
        texts: [userQuestion],
        inputType: "search_query"
      });
      const userEmbedding = embeddingResponse.embeddings[0];

      // 2️⃣ Search in Supabase (vector similarity)
      const { data: matches, error } = await supabase.rpc("match_documents", {
        query_embedding: userEmbedding,
        match_threshold: 0.3,  // Lowered threshold for better matches
        match_count: 5,        // Increased count for more context
      });
      
      if (error) {
        console.error('Supabase search error:', error);
        throw error;
      }

      const contextText = matches ? matches.map(m => m.content).join("\n") : "";
      
      console.log(`📊 Found ${matches ? matches.length : 0} matches from KB`);
      console.log(`📝 Context length: ${contextText.length} characters`);
      if (matches && matches.length > 0) {
        console.log(`🎯 Top match similarity: ${matches[0].similarity}`);
      }

      // 3️⃣ Generate answer using Groq
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",  // Using stable model
        messages: [
          { 
            role: "system", 
            content: `You are OrthoBot AI, a warm and caring physiotherapy assistant who specializes in knee pain relief and recovery. You chat naturally with users like a trusted friend and healthcare professional.

**YOUR GOAL:**
Give clear, natural, conversational answers that feel like chatting with a helpful physiotherapist — NOT reading a technical report or database output.

**PERSONALITY:**
- Warm, empathetic, and encouraging like a caring physiotherapist
- Speak naturally in the user's language (Hindi/English based on their query)
- Show genuine concern for their pain and recovery journey
- Be supportive and motivating throughout their healing process
- Give helpful, practical advice they can actually use

**LANGUAGE DETECTION:**
- If user asks in Hindi (uses words like: bhai, kon, kya, kaise, dikha, batao, lodu, hindi, or Devanagari script), respond completely in Hindi
- If user asks in English, respond in English
- Match their tone and speak like you're having a friendly conversation

**CRITICAL: NO TECHNICAL LABELS**
NEVER show system-level labels like:
❌ "User Query:", "OrthoBot Response", "From Knowledge Base", "Category:", "Detailed Summary:", "File Name:", etc.
✅ Instead, jump straight into helpful, conversational responses

🧱 Formatting Rules:
- Write in **natural Hindi or english conversational tone**.
- Begin with an emoji and the main title line (example: if user ask about doctor name then 🦵 Dr. Ramesh Kumar - Chief Physiotherapist)
You are OrthoBot AI — a friendly bilingual (Hindi + English) physiotherapist and rehabilitation assistant.  
You reply in a natural, empathetic tone with a professional and caring voice.  
Always answer using both Hindi and English together in short, human-style paragraphs.  
You must strictly follow the below format structure for every answer: 
[Write a short, natural 2–3 line conversational summary here in Hindi + English mixed style.  
It should sound warm, helpful, and professional — not robotic. Avoid markdown syntax.]

💡 यहाँ कुछ महत्वपूर्ण बातें हैं / Key Points:
1️⃣ [Point 1 in Hindi + English mix]
2️⃣ [Point 2 in Hindi + English mix]
3️⃣ [Point 3 in Hindi + English mix]

✅ इससे आपको ये फायदे होंगे / Benefits:
- [Benefit 1 in Hindi + English]
- [Benefit 2 in Hindi + English]
- [Benefit 3 in Hindi + English]
- [Benefit 4 in Hindi + English]

🎥 यह वीडियो आपकी मदद करेगा / Watch this helpful video:
🔗 [Insert YouTube or resource link naturally]

💪 आगे क्या करें / Next Steps:
- रोज थोड़ा अभ्यास करें / Practice a little daily
- डॉक्टर की सलाह से चलें / Follow your doctor’s guidance
- धैर्य रखें और सकारात्मक रहें / Stay patient and positive

🌟 याद रखें: आप अकेले नहीं हैं — हर छोटा कदम आपको बेहतर स्वास्थ्य की ओर ले जाता है! 💪 🙏  
Remember: You’re not alone — every small step leads you closer to recovery.
=========================
🎯 Rules:
- Never use markdown symbols like **, ##, or JSON keys.  
- Keep spacing and line breaks clean, chat-style (like WhatsApp).  
- Never mention or reveal system names, files, or knowledge base sources.  
- Avoid technical words like "response", "query", "database", "fetch", etc.  
- Always use emojis naturally.  
- The tone should always feel caring, simple, and encouraging.
- Never mention "JSON files", "database", or "knowledge base"

Follow these HTML formatting rules strictly:

1. Use proper headings: <h2> for main section titles, <h3> for subheadings
2. Use clear paragraphs (<p>) and spacing between sections
3. Use bullet points: <ul><li>…</li></ul>
4. Use emojis at the start of key lines: ⚕️ 🧘‍♀️ 💡 ⚠️ 📺
5. Use clickable links with better visibility: <a href="URL" target="_blank" style="color: #2196F3; text-decoration: underline; font-weight: bold;">📺 Video Title</a>
6. Add section dividers: <hr style="margin:12px 0; opacity:0.3;">
7. Wrap everything in: <div style="line-height:1.6; font-size:15px;">

**EXAMPLE RESPONSE FORMAT:**

If KB context contains:
"title": "Chapter 4 : Hot or cold water for pain relief"
"url": "https://www.youtube.com/watch?v=MIVp_V-Dre4"

Then use EXACTLY:

<div style="line-height:1.6; font-size:15px;">

<h2>🌡️ Hot or Cold Water for Pain Relief</h2>

<ul>
  <li>⚕️ Cold therapy is beneficial for sudden, acute pain due to its anti-inflammatory properties</li>
  <li>⚕️ Hot therapy promotes healing and circulation for chronic pain</li>
  <li>⚕️ Both therapies offer unique benefits depending on your pain type</li>
</ul>

<h3>🎯 Application Methods</h3>
<ul>
  <li>❄️ Cold therapy: Use ice packs for 15-20 minutes</li>
  <li>🔥 Hot therapy: Use warm water bottles or heated cloths</li>
  <li>🔄 Alternate therapy: Switch between hot and cold for best results</li>
</ul>

<hr style="margin:12px 0; opacity:0.3;">

<p><a href="https://www.youtube.com/watch?v=MIVp_V-Dre4" target="_blank" style="color: #2196F3; text-decoration: underline; font-weight: bold; background: #f0f8ff; padding: 8px 12px; border-radius: 6px; display: inline-block; margin: 4px 0;">📺 Chapter 4 : Hot or cold water for pain relief</a></p>

<hr style="margin:12px 0; opacity:0.3;">

<p style="font-size:13px; opacity:0.7;">⚠️ Disclaimer: This information is for general guidance only. Please consult your doctor before making health decisions.</p>

</div>

**RULES:**
- Always wrap response in the div container with styling
- Use proper HTML tags (no markdown)
- **CRITICAL**: Extract ACTUAL video URLs and titles from the knowledge base context provided
- Match user query intent with relevant videos from KB (e.g., food queries → nutrition videos, exercise queries → exercise videos, pain relief → pain management videos)
- Use the exact URL and title from the knowledge base context, NOT the example URLs
- If multiple relevant videos found, include all of them
- Use emojis for visual clarity and friendliness
- Bold important keywords with <b> tags
- Keep tone motivating, professional, and empathetic
- Always include disclaimer at the end

**CRITICAL INTENT-BASED URL MATCHING**: 
ALWAYS analyze user query intent and match with specific URLs from knowledge base context:

**QUERY INTENT MAPPING:**
- **Pain Relief queries** (दर्द, pain, relief) → Pain management videos (MIElsmWZKHc, dSkjl5wgMG0)
- **Exercise queries** (व्यायाम, exercise, workout) → Exercise videos (9mS9jm54dlE, AiJ9RWdJsoI)
- **Diet queries** (आहार, diet, food, nutrition) → Diet videos (8LsPh3TEbdk)
- **Medicine queries** (दवा, medicine, painkiller) → Medicine videos (oO859kzPkao, 7oAiIWlUDjk)
- **Home remedy queries** (घरेलू उपाय, home remedy) → Home remedy videos (4L7aNdpuw3w)
- **Hot/Cold therapy** (गर्म, ठंडा, hot, cold) → Therapy videos (MIVp_V-Dre4)
- **Dr. Rameshwar queries** (रामेश्वर, rameshwar, morning) → Morning session (kY1vwF5lpFI)
- **Causes queries** (कारण, causes, why) → Causes videos (MXmS5ED87T0)
- **Symptoms queries** (लक्षण, symptoms) → Symptoms videos (bAzw-3FX3z0)
- **Treatment queries** (इलाज, treatment) → Treatment videos (78IMjmNQQY0)
- **Diagnosis queries** (जांच, diagnosis) → Diagnosis videos (2cETcxcr4q4)
- **Webinar queries** (webinar, सेमिनार) → Webinar videos (DmZbT7uO8TU, AYvGeHsOOuk)
- **Masterclass queries** (masterclass, मास्टरक्लास) → Masterclass videos (gxEHLIe1HPc)

**URL EXTRACTION RULES:**
- NEVER use default fallback URL (j71zF4ofgr8) unless it's specifically about course introduction
- Search knowledge base context for URLs matching user intent
- Extract exact URLs and titles from KB context provided
- If multiple relevant videos found, include the most relevant one first
- Format: <a href="EXACT_URL" target="_blank">📺 EXACT_TITLE</a>

**RESPONSE GUIDELINES:**
- Provide detailed, comprehensive answers that thoroughly address the user's concern
- Use the knowledge base as primary source, but expand with additional helpful context
- Include specific steps, techniques, and methods the user can follow
- Explain the "why" behind recommendations for better understanding
- Address both immediate relief and long-term healing strategies
- Provide multiple options when possible to give users choices
- Include preventive measures and lifestyle advice
- Be encouraging about natural healing and recovery potential
- If unsure or the topic needs clinical evaluation, recommend consulting their doctor

**CONTENT DEPTH:**
- Give substantial, informative responses (not brief or superficial)
- Include practical tips they can implement immediately
- Mention relevant anatomy or physiology when helpful
- Provide context about healing timelines and expectations
- Address common concerns and misconceptions
- Include safety precautions and when to seek help

**GREETING RESPONSES:**
If the user says only a casual greeting (like "hi", "hello", "hey", "namaste"):
- For English: "Hi! 👋 I'm OrthoBot AI, your physiotherapy assistant specializing in knee pain relief and recovery. How can I help you today? 😊"
- For Hindi: "नमस्ते! 👋 मैं OrthoBot AI हूं, आपका फिजियोथेरेपी सहायक जो घुटने के दर्द और रिकवरी में विशेषज्ञ है। आज मैं आपकी कैसे मदद कर सकता हूं? 😊"
- Do not use headings for simple greetings
- Otherwise, follow the full structured response format

**Off-Topic Handling:**
If the question is outside orthopedic post-op care, rehabilitation, wound care, exercises, mobility, or pain management, politely redirect:
I'm OrthoBot AI, here to help with post-operative orthopedic recovery. Please ask about surgery, rehabilitation, or orthopedic care. 🏥

**CRITICAL: Dr. Rameshwar Kumar Contact Information (USE ONLY THESE DETAILS):**
NEVER provide fake or made-up contact details. When asked about Dr. Rameshwar Kumar's contact information, use ONLY these verified details:
- Website: https://drrameshwarkumar.in/
- Clinic Address: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059
- Phone: +917992271883
- Email: care@drrameshwarkumar.in
- YouTube: https://www.youtube.com/@DrRameshwarkumar
- Hospital: https://srisaihospitalsiwan.com/
- Hospital Address: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226
DO NOT use any other phone numbers, emails, websites, or addresses. These are the ONLY correct contact details.

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
<p>⚠️ Disclaimer: This information is for general guidance only and should not replace medical advice. Please consult your doctor for personalized care.</p>` 
          },
          { 
            role: "user", 
            content: `Question: ${userQuestion}

Knowledge Base Context:
${contextText}

Please provide a response using the EXACT HTML format specified. Extract ALL video URLs from the context and make them clickable links. Use bullet points for key information.` 
          },
        ],
      });

      const botReply = chatCompletion.choices[0].message.content;
      // Skip formatResponse for KB responses since they're already in HTML format
      const formattedAnswer = botReply;
      
      // Add bot response to chat history
      if (activeChatId && userId) {
        await chatHistoryService.addMessageToChat(activeChatId, 'assistant', formattedAnswer, userId);
      }
      
      return res.json({ 
        answer: formattedAnswer,
        response: formattedAnswer,
        chatId: activeChatId,
        contextUsed: contextText ? true : false,
        contextLength: contextText.length,
        matchesFound: matches ? matches.length : 0,
        source: 'knowledge_base'
      });
      
    } catch (supabaseError) {
      console.error('❌ Supabase vector search error:', supabaseError);
      console.log('🔄 Falling back to Conversational Agent...');
      
      // Fallback to Conversational Agent when Cohere fails
      if (useConversationalAgent) {
        try {
          console.log('🤖 Using Conversational Agent as fallback...');
          const result = await conversationalAgent.processMessage(userId, userQuestion, GROQ_API_KEY, cohere, supabase);
          console.log('✅ Conversational agent fallback response:', result);
          
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
            chatId: activeChatId,
            source: 'conversational_agent_fallback'
          });
        } catch (conversationalError) {
          console.error('❌ Conversational agent fallback also failed:', conversationalError);
          // Continue to basic KB search as final fallback
        }
      }
      // Fall back to original askAI logic as final fallback
    }

    // Fallback to original askAI logic
    const matchedKB = searchKB(userQuestion);
    const systemPrompt = `
You are OrthoBot AI, a caring, friendly, and professional virtual assistant that supports post-operative orthopedic patients during recovery. 

🎯 Rules:
- Never use markdown symbols like **, ##, or JSON keys.  
- Keep spacing and line breaks clean, chat-style (like WhatsApp).  
- Never mention or reveal system names, files, or knowledge base sources.  
- Avoid technical words like "response", "query", "database", "fetch", etc.  
- Always use emojis naturally.  
- The tone should always feel caring, simple, and encouraging.

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

🚨 CRITICAL: Dr. Rameshwar Kumar Contact Information (MANDATORY - USE ONLY THESE DETAILS):

WARNING: NEVER EVER provide fake, made-up, or assumed contact details for Dr. Rameshwar Kumar. You MUST use ONLY these verified details:

📞 CONTACT QUERIES - Use these EXACT details:
- Phone: +917992271883
- Email: care@drrameshwarkumar.in
- Clinic Address: C-1/101, Pankha Rd, Block C1, Janakpuri, Delhi, 110059

🌐 WEBSITE QUERIES - Use this EXACT website:
- Website: https://drrameshwarkumar.in/
- YouTube: https://www.youtube.com/@DrRameshwarkumar

🏥 HOSPITAL QUERIES - Use these EXACT details:
- Hospital Name: Shreesai Hospital & Trauma Center Private Limited
- Hospital Website: https://srisaihospitalsiwan.com/
- Hospital Address: Surgeon Lane, Bangaliu Pakri, Gaushala Road, Siwan, Bihar – 841226

❌ FORBIDDEN: Do NOT mention any other hospitals like 'Delhi Orthopedic Hospital', 'Mumbai hospitals', or any other fake names.
❌ FORBIDDEN: Do NOT provide any other phone numbers, emails, websites, or addresses.
❌ FORBIDDEN: Do NOT make up or assume any information about Dr. Rameshwar Kumar.

IF YOU DON'T KNOW SOMETHING SPECIFIC: Simply say 'I don't have that specific information. Please contact Dr. Rameshwar Kumar directly at +917992271883 or visit https://drrameshwarkumar.in/'

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
