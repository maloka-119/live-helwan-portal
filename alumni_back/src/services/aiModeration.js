const { CohereClient } = require("cohere-ai");

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

const moderateContent = async (content) => {
  try {
    const response = await cohere.chat({
     model: "command-a-03-2025",
      message: `
You are an AI content moderator.

Classify this text into ONLY one number:

0 = extremely toxic, hateful, abusive, sexual, violent, dangerous, or sensitive content
1 = mildly toxic, offensive, suspicious, or inappropriate
2 = safe and normal content

ONLY return the number.

Text:
"${content}"
      `,
      temperature: 0,
    });

    const result = response.text.trim();

    if (result === "0") return 0;
    if (result === "1") return 1;

    return 2;
  } catch (error) {
    console.error("AI Moderation Error:", error.message);
    return 2;
  }
};

module.exports = { moderateContent };