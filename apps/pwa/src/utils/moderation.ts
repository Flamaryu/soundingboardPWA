/**
 * Production-grade OpenAI Moderation API Utility.
 * Evaluates incoming text for hate speech, violence, self-harm, and toxicity.
 * Implements aggressive diagnostic logging and fail-closed safety security.
 */
export async function failsModeration(text: string): Promise<boolean> {
  if (!text || !text.trim()) return false;
  
  console.log("🛡️ MODERATION CHECK INITIATED FOR:", text);
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ MODERATION ERROR: OPENAI_API_KEY is missing from environment variables.");
    return true; // FAIL CLOSED: Block post if we can't moderate it
  }

  try {
    console.log("📡 Sending payload to OpenAI...");
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text }),
    });

    if (!response.ok) {
      console.error("❌ OPENAI API ERROR. Status:", response.status, response.statusText);
      const errorText = await response.text();
      console.error("Error Details:", errorText);
      return true; // FAIL CLOSED
    }

    const data = await response.json();
    const isFlagged = Boolean(data?.results?.[0]?.flagged);
    
    console.log(`✅ OpenAI Response Received. Flagged for toxicity: ${isFlagged}`);
    if (isFlagged) {
      console.log("🚩 Categories flagged:", data?.results?.[0]?.categories);
    }
    
    return isFlagged;
    
  } catch (error) {
    console.error("❌ SEVERE MODERATION CRASH:", error);
    return true; // FAIL CLOSED
  }
}
