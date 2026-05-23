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

  // Ask for one section per focus area as separate fields to avoid JSON escaping issues
  const prompt = `You are a fintech intelligence analyst producing a daily briefing for Prince Williams, VP of Emerging Technologies at Bank Fund Staff Federal Credit Union (BFSFCU).

Today is ${dateStr}. Search the web for the latest fintech news and developments from today or the past 48 hours relevant to credit unions across these focus areas: ${focusAreas.join(", ")}.

For each focus area, write a 2-3 paragraph analyst-style summary with specific companies, products, regulatory moves, or trends. Frame everything for a credit union VP deciding what to prioritize this week.

You MUST respond with ONLY a raw JSON object. Rules:
- No markdown code fences (no backticks)
- No text before or after the JSON
- All string values must be on a single line (no literal newlines inside strings — use \\n if needed)
- Use double quotes only, no smart quotes
- Escape any double quotes inside string values with \\\"

Use exactly this structure:
{"sections":[{"label":"FOCUS_AREA_NAME","content":"SUMMARY_TEXT"}],"bottom_line":"OVERALL_TAKEAWAY"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.VITE_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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
    const rawText = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON server-side and send clean structured data to frontend
    let parsed;
    try {
      // Strip any accidental markdown fences
      let clean = rawText.trim();
      clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      // Extract the JSON object
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON object found in response");
      clean = clean.slice(start, end + 1);

      parsed = JSON.parse(clean);
    } catch (parseErr) {
      // If parsing fails, return the raw text so the frontend can show a useful error
      return res.status(422).json({ error: "JSON parse failed: " + parseErr.message, raw: rawText.slice(0, 500) });
    }

    // Validate structure
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      return res.status(422).json({ error: "Invalid response structure", raw: rawText.slice(0, 500) });
    }

    return res.status(200).json({ sections: parsed.sections, bottom_line: parsed.bottom_line || "" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
