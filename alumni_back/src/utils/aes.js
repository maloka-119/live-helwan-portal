const crypto = require("crypto");

const ENC_ALGO = "aes-256-cbc";

// Get encryption key from environment variable or use a default (for development only)
const NID_ENC_KEY =
  process.env.NID_ENC_KEY || "default-encryption-key-change-in-production";

if (!process.env.NID_ENC_KEY) {
  console.warn(
    "⚠️  WARNING: NID_ENC_KEY environment variable is not set. Using default key (NOT SECURE FOR PRODUCTION)"
  );
}

const ENC_KEY = crypto.createHash("sha256").update(NID_ENC_KEY).digest();

function decryptNationalId(encryptedString) {
  try {
    if (!encryptedString) return null;

    // لو مفيش IV (old data)
    if (!encryptedString.includes(":")) {
      console.warn("⚠️ Old encrypted NID format detected");
      return null; // أو حاول decrypt بطريقة قديمة لو كانت موجودة
    }

    const [ivHex, encrypted] = encryptedString.split(":");

    if (!ivHex || !encrypted) return null;

    const iv = Buffer.from(ivHex, "hex");

    if (iv.length !== 16) {
      console.warn("⚠️ Invalid IV length:", iv.length);
      return null;
    }

    const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("NID decrypt error:", err);
    return null;
  }
}

/**
 * AES-256-CBC encryption لنمبر الـ NID
 */
function encryptNationalId(nid) {
  const iv = crypto.randomBytes(16); // IV عشوائي

  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);

  let encrypted = cipher.update(nid, "utf8", "hex");
  encrypted += cipher.final("hex");

  // نخزن IV مع النص المشفر
  return iv.toString("hex") + ":" + encrypted;
}

module.exports = { decryptNationalId, encryptNationalId };
