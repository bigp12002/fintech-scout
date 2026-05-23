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

Today is ${dateStr}. Search the web for the latest fintech news and developments from today or the past 48 hours relevant to credit unions across these focus areas: ${focusAreas.join(", ")}.

For each focus area, write a 2-3 paragraph analyst-style summary covering specific companies, products, regulatory moves, funding events, or trends. Frame everything for a credit union VP deciding what to prioritize this week — practical and actionable.

After each section's content, list up to 3 source URLs that are most relevant to that section for further reading.

Respond using EXACTLY this format and nothing else. Do not add any text before <briefing> or after </briefing>:

<briefing>
${focusAreas.map(area => `<section>
<label>${area}</label>
<content>Your 2-3 paragraph summary here.</content>
<sources>
<source><title>Article title here</title><url>https://...</url></source>
<source><title>Article title here</title><url>https://...</url></source>
</sources>
</section>`).join("\n")}
<bottom_line>Your 1-2 sentence overall takeaway here.</bottom_line>
</briefing>`;

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
        max_tokens: 4000,
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

    // Parse sections with sources
    const sections = [];
    const sectionRegex = /<section>\s*<label>([\s\S]*?)<\/label>\s*<content>([\s\S]*?)<\/content>\s*(?:<sources>([\s\S]*?)<\/sources>)?\s*<\/section>/g;
    let match;
    while ((match = sectionRegex.exec(rawText)) !== null) {
      const sourcesRaw = match[3] || "";
      const sources = [];
      const sourceRegex = /<source>\s*<title>([\s\S]*?)<\/title>\s*<url>([\s\S]*?)<\/url>\s*<\/source>/g;
      let srcMatch;
      while ((srcMatch = sourceRegex.exec(sourcesRaw)) !== null) {
        const url = srcMatch[2].trim();
        // Only include valid-looking URLs
        if (url.startsWith("http")) {
          sources.push({ title: srcMatch[1].trim(), url });
        }
      }
      sections.push({
        label: match[1].trim(),
        content: match[2].trim(),
        sources,
      });
    }

    const bottomLineMatch = rawText.match(/<bottom_line>([\s\S]*?)<\/bottom_line>/);
    const bottom_line = bottomLineMatch ? bottomLineMatch[1].trim() : "";

    if (sections.length === 0) {
      return res.status(422).json({ error: "Could not parse response", raw: rawText.slice(0, 600) });
    }

    return res.status(200).json({ sections, bottom_line });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
