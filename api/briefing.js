export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { focusAreas, dateStr } = req.body;

  if (!focusAreas || !Array.isArray(focusAreas) || focusAreas.length === 0) {
    return res.status(400).json({ error: "focusAreas must be a non-empty array" });
  }

  const prompt = `You are a fintech intelligence analyst producing a daily briefing for Prince Williams, VP of Emerging Technologies at Bank Fund Staff Federal Credit Union (BFSFCU).

Today is ${dateStr}. Search the web for the latest fintech news and developments from today or the past 48 hours that are relevant to credit unions, across these focus areas: ${focusAreas.join(", ")}.

For each focus area, surface specific companies, products, regulatory moves, funding events, or emerging trends worth attention. Frame everything through the lens of a credit union VP deciding what to prioritize this week — practical and actionable, not generic.

Respond ONLY with a valid JSON object using exactly this structure. No markdown fences, no explanation before or after the JSON:
{
  "sections": [
    { "label": "focus area name", "content": "2-3 paragraph analyst-style summary with specific news and what it means for credit unions" }
  ],
  "bottom_line": "1-2 sentence overall takeaway for today"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.VITE_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Anthropic API error ${response.status}`, detail: errText.slice(0, 300) });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
