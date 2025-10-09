// upload_kb.js
import fs from "fs";
import path from "path";
import { CohereClient } from "cohere-ai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// ============ CONFIG ============
// Prefer service role for writes; falls back to anon if provided and RLS is off
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);
// Initialize Cohere
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// Fail-fast environment validation to avoid runtime 401s
function validateEnv() {
  const cohereKey = process.env.COHERE_API_KEY || "";
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

  if (!cohereKey) {
    console.error("❌ COHERE_API_KEY is missing. Set it in .env (get from https://dashboard.cohere.com)");
    process.exit(1);
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ SUPABASE_URL or SUPABASE_*KEY missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_KEY in .env");
    process.exit(1);
  }
}

function chunkText(text, maxLen = 1000, overlap = 200) {
  const chunks = [];
  const step = Math.max(1, maxLen - overlap);
  let start = 0;
  const totalLen = typeof text === "string" ? text.length : String(text).length;
  const src = typeof text === "string" ? text : String(text);
  while (start < totalLen) {
    const end = Math.min(start + maxLen, totalLen);
    chunks.push(src.slice(start, end));
    if (end === totalLen) break; // reached the end
    start += step;
  }
  return chunks;
}

async function embedAndInsertChunk(chunk, meta) {
  const embRes = await createEmbeddingsWithRetry([chunk]);
  const embedding = embRes[0];

  const { error } = await supabase.from("kb_vectors").insert([{
    content: chunk,
    metadata: meta,
    source: meta.source || meta.title || null,
    embedding
  }]);
  if (error) console.error("Supabase insert error:", error);
}

// ===== Replace OpenAI embeddings with Cohere =====
async function createEmbeddingsWithRetry(inputs, maxRetries = 6) {
  let attempt = 0;
  while (true) {
    try {
      const resp = await cohere.embed({
        model: "embed-english-v3.0", // Full model produces 1024 dimensions
        texts: inputs,
        inputType: "search_document"
      });
      return resp.embeddings;
    } catch (err) {
      const status = err?.status || err?.code;
      const isRate = status === 429;
      const isServer = status === 500 || status === 502 || status === 503 || status === 504;
      if ((isRate || isServer) && attempt < maxRetries) {
        const backoffMs = Math.min(30000, 2000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
        console.warn(`⚠️ Embedding API error (${status}). Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        attempt++;
        continue;
      }
      console.error("❌ Embedding failed:", err);
      throw err;
    }
  }
}

// Flatteners for different schemas
function flattenRehabKB(jsonObj, currentPath = []) {
  const results = [];
  if (Array.isArray(jsonObj)) {
    jsonObj.forEach((val, idx) => {
      const subPath = currentPath.concat([String(idx)]);
      results.push(...flattenRehabKB(val, subPath));
    });
  } else if (jsonObj && typeof jsonObj === "object") {
    if (jsonObj.question && jsonObj.answer) {
      results.push({
        title: currentPath.join(" > ") || "faq_item",
        content: `Q: ${jsonObj.question}\nA: ${jsonObj.answer}`,
        path: currentPath
      });
    } else {
      Object.keys(jsonObj).forEach(key => {
        const subPath = currentPath.concat([key]);
        const value = jsonObj[key];
        if (typeof value === "string") {
          results.push({
            title: subPath.join(" > "),
            content: value,
            path: subPath
          });
        } else {
          results.push(...flattenRehabKB(value, subPath));
        }
      });
    }
  } else if (typeof jsonObj === "string") {
    results.push({ title: currentPath.join(" > ") || "text", content: jsonObj, path: currentPath });
  }
  return results;
}

function extractItemsFromAnySchema(json, fileBaseName) {
  // 1) Preferred schema: knowledgeBase array
  if (json && typeof json === "object" && Array.isArray(json.knowledgeBase)) {
    return json.knowledgeBase.map((item, idx) => ({
      title: item.title || `${fileBaseName} item ${idx}`,
      url: item.url,
      keywords: item.keywords,
      intent: item.intent,
      summary: item.summary,
      content: String(item.content || ""),
      itemIndex: idx,
      path: [fileBaseName, "knowledgeBase", String(idx)]
    }));
  }

  // 2) Structured rehab_knowledge_base style
  if (json && typeof json === "object") {
    const flattened = flattenRehabKB(json, [fileBaseName]);
    return flattened.map((i, idx) => ({
      title: i.title,
      content: String(i.content || ""),
      itemIndex: idx,
      path: i.path
    })).filter(i => i.content && i.content.trim().length > 0);
  }

  // 3) Raw string or fallback
  const rawStr = typeof json === "string" ? json : JSON.stringify(json);
  return [{ title: fileBaseName, content: rawStr, itemIndex: 0, path: [fileBaseName] }];
}

async function processFile(filePath) {
  console.log(`📖 Reading file: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  let json;
  try { 
    json = JSON.parse(raw); 
    console.log(`✅ Successfully parsed JSON from ${path.basename(filePath)}`);
  } catch (e) { 
    console.log(`⚠️ Failed to parse JSON, treating as raw text: ${e.message}`);
    json = raw; 
  }

  const fileBaseName = path.basename(filePath);
  const items = extractItemsFromAnySchema(json, fileBaseName);
  console.log(`📝 Extracted ${items.length} items from ${fileBaseName}`);

  if (items.length === 0) {
    console.log(`⚠️ No items found in ${fileBaseName}`);
    return;
  }

  let totalChunksProcessed = 0;
  for (const [itemIndex, item] of items.entries()) {
    const text = item.content || "";
    if (!text || !text.trim()) {
      console.log(`⚠️ Skipping empty item ${itemIndex + 1}/${items.length}`);
      continue;
    }
    
    const chunks = chunkText(text, 1000, 200);
    console.log(`📄 Item ${itemIndex + 1}/${items.length}: "${item.title}" -> ${chunks.length} chunks`);

    // Process in batches to reduce API calls and avoid 429
    const batchSize = 32;
    for (let startIdx = 0; startIdx < chunks.length; startIdx += batchSize) {
      const batch = chunks.slice(startIdx, startIdx + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(startIdx/batchSize) + 1} (${batch.length} chunks)...`);
      
      // Create embeddings with retry and backoff (Cohere)
      const embeddings = await createEmbeddingsWithRetry(batch);
      console.log(`✅ Generated ${embeddings.length} embeddings`);

      // Build rows for Supabase insert
      const rows = embeddings.map((embedding, idx) => {
        const absoluteIdx = startIdx + idx;
        return {
          content: batch[idx],
          metadata: {
            source: fileBaseName,
            title: item.title,
            url: item.url,
            keywords: item.keywords,
            intent: item.intent,
            summary: item.summary,
            path: item.path,
            itemIndex: item.itemIndex,
            chunkIndex: absoluteIdx
          },
          source: item.title || fileBaseName,
          embedding
        };
      });

      const { error } = await supabase.from("kb_vectors").insert(rows);
      if (error) {
        console.error("❌ Supabase insert error:", error);
      } else {
        console.log(`✅ Successfully inserted ${rows.length} vectors into Supabase`);
        totalChunksProcessed += rows.length;
      }

      // Gentle throttle between batches
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  console.log(`🎉 Completed ${fileBaseName}: ${totalChunksProcessed} total chunks processed`);
}

async function main() {
  validateEnv();
  const folder = "./Dr_kbs"; // folder me tera JSONs
  
  // Check if folder exists
  if (!fs.existsSync(folder)) {
    console.error(`❌ Folder ${folder} does not exist!`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(folder).filter(f => f.endsWith(".json"));
  console.log(`📁 Found ${files.length} JSON files in ${folder}`);
  
  // Skip already uploaded files
  const skipFiles = ['courseVideos_kb.json']; // Already in Supabase
  const filesToProcess = files.filter(f => !skipFiles.includes(f));
  
  console.log(`⚠️ Skipping already uploaded files: ${skipFiles.join(', ')}`);
  console.log(`🔄 Files to process: ${filesToProcess.join(', ')}`);
  
  if (filesToProcess.length === 0) {
    console.log("⚠️ No new JSON files found to process.");
    return;
  }
  
  for (const f of filesToProcess) {
    console.log(`🔄 Processing ${f}...`);
    try {
      await processFile(path.join(folder, f));
      console.log(`✅ Successfully processed ${f}`);
    } catch (error) {
      console.error(`❌ Error processing ${f}:`, error.message);
    }
  }
  console.log("✅ Done uploading KB to Supabase.");
}

main().catch(console.error);
