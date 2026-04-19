// facultiesService.js

const faculties = [
  {
    code: "ENG_HEL",
    ar: "كلية الهندسة بحلوان",
    en: "Faculty of Engineering (Helwan)",
    synonyms: ["هندسة حلوان", "هندسه حلوان", "engineering helwan", "helwan engineering", "eng helwan"]
  },
  {
    code: "ENG_MAT",
    ar: "كلية الهندسة بالمطرية",
    en: "Faculty of Engineering (Mataria)",
    synonyms: ["هندسة المطرية", "هندسه مطريه", "engineering mataria", "mataria engineering"]
  },
  {
    code: "COMP_AI",
    ar: "كلية الحاسبات والذكاء الاصطناعي",
    en: "Faculty of Computers & Artificial Intelligence",
    synonyms: ["حاسبات", "ذكاء اصطناعي", "computer science", "cs", "ai"]
  },
  {
    code: "SCI",
    ar: "كلية العلوم",
    en: "Faculty of Science",
    synonyms: ["علوم", "science"]
  },
  {
    code: "PHARM",
    ar: "كلية الصيدلة",
    en: "Faculty of Pharmacy",
    synonyms: ["صيدله", "pharmacy"]
  },
  {
    code: "MED",
    ar: "كلية الطب",
    en: "Faculty of Medicine",
    synonyms: ["طب", "medicine", "doctor"]
  },
  {
    code: "NURS",
    ar: "كلية التمريض",
    en: "Faculty of Nursing",
    synonyms: ["تمريض", "nursing"]
  },
  {
    code: "TECH_ED",
    ar: "كلية التكنولوجيا والتعليم",
    en: "Faculty of Technology & Education",
    synonyms: ["تكنولوجيا التعليم", "technology education"]
  },
  {
    code: "INT_BUS",
    ar: "كلية الاقتصاد وإدارة الأعمال الدولية بالشيخ زايد",
    en: "Faculty of International Business & Economics (Sheikh Zayed)",
    synonyms: ["اقتصاد الشيخ زايد", "international business sheikh zayed"]
  },
  {
    code: "ARTS",
    ar: "كلية الآداب",
    en: "Faculty of Arts",
    synonyms: ["آداب", "arts"]
  },
  {
    code: "LAW",
    ar: "كلية الحقوق",
    en: "Faculty of Law",
    synonyms: ["حقوق", "law"]
  },
  {
    code: "COMMERCE",
    ar: "كلية التجارة وإدارة الأعمال",
    en: "Faculty of Commerce & Business Administration",
    synonyms: ["تجارة", "commerce", "business administration"]
  },
  {
    code: "SOCIAL_WORK",
    ar: "كلية الخدمة الاجتماعية",
    en: "Faculty of Social Work",
    synonyms: ["خدمة اجتماعية", "social work"]
  },
  {
    code: "EDU",
    ar: "كلية التربية",
    en: "Faculty of Education",
    synonyms: ["تربية", "education"]
  },
  {
    code: "SPEC_EDU",
    ar: "كلية التربية النوعية",
    en: "Faculty of Specific Education",
    synonyms: ["تربية نوعية", "specific education"]
  },
  {
    code: "TOURISM",
    ar: "كلية السياحة والفنادق",
    en: "Faculty of Tourism & Hotels",
    synonyms: ["سياحة وفنادق", "tourism and hotels"]
  },
  {
    code: "FINE_ARTS",
    ar: "كلية الفنون الجميلة",
    en: "Faculty of Fine Arts",
    synonyms: ["فنون جميلة", "fine arts"]
  },
  {
    code: "APPL_ARTS",
    ar: "كلية الفنون التطبيقية",
    en: "Faculty of Applied Arts",
    synonyms: ["فنون تطبيقية", "applied arts"]
  },
  {
    code: "ART_EDU",
    ar: "كلية التربية الفنية",
    en: "Faculty of Art Education",
    synonyms: ["تربية فنية", "art education"]
  },
  {
    code: "MUSIC_EDU",
    ar: "كلية التربية الموسيقية",
    en: "Faculty of Music Education",
    synonyms: ["تربية موسيقية", "music education"]
  },
  {
    code: "PHY_ED_M",
    ar: "كلية التربية الرياضية بنين",
    en: "Faculty of Physical Education (Men)",
    synonyms: ["تربية رياضية بنين", "physical education men"]
  },
  {
    code: "PHY_ED_W",
    ar: "كلية التربية الرياضية بنات",
    en: "Faculty of Physical Education (Women)",
    synonyms: ["تربية رياضية بنات", "physical education women"]
  },
  {
    code: "IPR",
    ar: "المعهد القومي للملكية الفكرية",
    en: "National Institute of Intellectual Property",
    synonyms: ["معهد الملكية الفكرية", "intellectual property institute"]
  },
  {
    code: "NURS_INST",
    ar: "معهد التمريض",
    en: "Nursing Institute",
    synonyms: ["معهد تمريض", "nursing institute"]
  }
];

// ترجع كل الكليات
function getHelwanFaculties() {
  return faculties.map(f => ({
    code: f.code,
    ar: f.ar,
    en: f.en
  }));
}

// Normalize — يربط أي اسم عربي/إنجليزي بالكود
function normalizeCollegeName(input) {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();

  for (const col of faculties) {
    // 1. تحقق من الكود أولاً (case-insensitive)
    if (col.code.toLowerCase() === cleaned) return col.code;
    
    // 2. تحقق من الاسم العربي
    if (col.ar.toLowerCase() === cleaned) return col.code;
    
    // 3. تحقق من الاسم الإنجليزي
    if (col.en.toLowerCase() === cleaned) return col.code;
    
    // 4. تحقق من المرادفات
    if (col.synonyms.some(s => s.toLowerCase() === cleaned)) return col.code;
  }

  return null;
}

// جلب اسم الكلية حسب الكود واللغة
function getCollegeNameByCode(code, lang = "ar") {
  const col = faculties.find(f => f.code === code);
  if (!col) return null;
  return lang === "en" ? col.en : col.ar;
}

module.exports = {
  getHelwanFaculties,
  normalizeCollegeName,
  getCollegeNameByCode
};
