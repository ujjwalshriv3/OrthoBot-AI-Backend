// add_contact_link.js - Just add the contact link to Supabase
import { CohereClient } from "cohere-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

async function createEmbedding(text) {
  try {
    const resp = await cohere.embed({
      model: "embed-english-v3.0",
      texts: [text],
      inputType: "search_document"
    });
    return resp.embeddings[0];
  } catch (err) {
    console.error("❌ Embedding failed:", err);
    throw err;
  }
}

async function addContactLink() {
  console.log("🔗 Adding Dr. Rameshwar Kumar contact link to Supabase...");
  
  const contactContent = "Dr. Rameshwar Kumar Contact Page: https://drrameshwarkumar.in/contact/ - Official contact form and detailed contact information for Dr. Rameshwar Kumar. Phone: +917992271883, Email: care@drrameshwarkumar.in";
  
  // Create embedding for the contact link
  const embedding = await createEmbedding(contactContent);
  
  // Insert into Supabase
  const { error } = await supabase.from("kb_vectors").insert([{
    content: contactContent,
    metadata: {
      source: "drRameshwar_kb.json",
      title: "Dr. Rameshwar Kumar Contact Page",
      url: "https://drrameshwarkumar.in/contact/",
      keywords: ["contact", "rameshwar", "phone", "email", "contact page"],
      intent: "contact_information",
      summary: "Dr. Rameshwar Kumar official contact page link",
      path: ["drRameshwar_kb", "contact", "contact_page"],
      itemIndex: 0,
      chunkIndex: 0
    },
    source: "Dr. Rameshwar Kumar Contact Page",
    embedding
  }]);
  
  if (error) {
    console.error("❌ Supabase insert error:", error);
  } else {
    console.log("✅ Successfully added contact link to Supabase!");
  }
}

addContactLink().catch(console.error);
