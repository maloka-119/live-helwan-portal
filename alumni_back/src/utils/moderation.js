const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // حطي هنا مفتاح الـ API بتاعك
});

const openai = new OpenAIApi(configuration);

/**
 * ترجع true لو المحتوى سيء، false لو تمام
 */
async function isContentBad(text) {
  if (!text) return false;

  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = response.data.results[0];
    return result.flagged; // true لو المحتوى غير مسموح
  } catch (err) {
    console.error("Moderation API error:", err);
    // لو فيه مشكلة في الـ API نعتبر المحتوى آمن
    return false;
  }
}

module.exports = { isContentBad };
