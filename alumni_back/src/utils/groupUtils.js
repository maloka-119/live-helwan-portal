// utils/groupUtils.js
const { Group } = require("../models");
const { Op } = require("sequelize"); // 👈 أضفنا هذا السطر

const findMatchingGroup = async (faculty_code, graduation_year) => {
  try {
    console.log("\n" + "🔍".repeat(30));
    console.log(
      `🔍 FINDING GROUP for faculty: ${faculty_code}, year: ${graduation_year}`
    );
    console.log("🔍".repeat(30));

    // 📍 LOG 1: كل الجروبات الموجودة
    console.log("\n📍 [1] ALL GROUPS IN DATABASE:");
    const allGroups = await Group.findAll({
      attributes: ["id", "group-name", "faculty_code", "graduation_year"],
    });

    if (allGroups.length === 0) {
      console.log("   ❌ No groups found in database");
    } else {
      console.log(`   📊 Total groups: ${allGroups.length}`);
      allGroups.forEach((group, index) => {
        console.log(`   Group ${index + 1}:`);
        console.log(`      - ID: ${group.id}`);
        console.log(`      - Name: ${group["group-name"]}`);
        console.log(`      - Faculty Code: ${group.faculty_code || "null"}`);
        console.log(
          `      - Graduation Year: ${group.graduation_year || "null"}`
        );
      });
    }

    // أولاً: بحث دقيق
    console.log("\n📍 [2] SEARCHING FOR EXACT MATCH:");
    console.log(
      `   - Criteria: faculty_code = "${faculty_code}", graduation_year = ${graduation_year}`
    );

    const exactMatch = await Group.findOne({
      where: {
        faculty_code: faculty_code,
        graduation_year: graduation_year,
      },
    });

    if (exactMatch) {
      console.log(`   ✅ EXACT MATCH FOUND:`);
      console.log(`      - Group ID: ${exactMatch.id}`);
      console.log(`      - Group Name: ${exactMatch["group-name"]}`);
      console.log(`      - Faculty Code: ${exactMatch.faculty_code}`);
      console.log(`      - Year: ${exactMatch.graduation_year}`);
      return exactMatch;
    }

    console.log(`   ❌ No exact match found`);

    // ثانياً: بحث عن جروب عام لنفس الكلية (أي سنة)
    console.log("\n📍 [3] SEARCHING FOR FACULTY GROUP (any year):");
    console.log(`   - Criteria: faculty_code = "${faculty_code}" (any year)`);

    const sameFaculty = await Group.findOne({
      where: { faculty_code: faculty_code },
    });

    if (sameFaculty) {
      console.log(`   ✅ FACULTY GROUP FOUND:`);
      console.log(`      - Group ID: ${sameFaculty.id}`);
      console.log(`      - Group Name: ${sameFaculty["group-name"]}`);
      console.log(`      - Faculty Code: ${sameFaculty.faculty_code}`);
      console.log(`      - Year: ${sameFaculty.graduation_year || "any"}`);
      return sameFaculty;
    }

    console.log(`   ❌ No faculty group found for code: ${faculty_code}`);
    
    // 🔥 الخطوة الجديدة: البحث بالاسم (fallback)
    console.log("\n📍 [4] SEARCHING BY GROUP NAME (fallback):");
    
    // تصحيح: نحدد الكلمات المفتاحية لكل كلية
    const facultyNamePatterns = {
      'COMP_AI': ['Computers', 'Artificial Intelligence', 'حاسبات', 'كمبيوتر'],
      'ENG_MAT': ['Engineering', 'Mataria', 'هندسة', 'مطرية'],
      'SPEC_EDU': ['Specific Education', 'تربية', 'نوعية'],
      'NURS': ['Nursing', 'تمريض'],
    };
    
    // استخدام patterns خاصة بالكلية أو البحث بالكود نفسه
    const patterns = facultyNamePatterns[faculty_code] || [faculty_code];
    console.log(`   - Searching for groups with names containing:`, patterns);
    
    for (const pattern of patterns) {
      const groupByName = await Group.findOne({
        where: {
          [Op.or]: [
            { "group-name": { [Op.like]: `%${pattern}%` } },
          ],
        },
      });
      
      if (groupByName) {
        console.log(`   ✅ GROUP FOUND BY NAME:`);
        console.log(`      - Group ID: ${groupByName.id}`);
        console.log(`      - Group Name: ${groupByName["group-name"]}`);
        console.log(`      - Current Faculty Code: ${groupByName.faculty_code || 'null'}`);
        
        // لو لقينا جروب باسمه مطابق لكن faculty_code بتاعه null، نحدثه
        if (!groupByName.faculty_code) {
          console.log(`   🔧 Updating group faculty_code from null to ${faculty_code}...`);
          groupByName.faculty_code = faculty_code;
          await groupByName.save();
          console.log(`   ✅ Group updated successfully!`);
        } else if (groupByName.faculty_code !== faculty_code) {
          console.log(`   ⚠️ Group has different faculty_code: ${groupByName.faculty_code}`);
          // هنا ممكن نختار نرجع الجروب ولا لا حسب المنطق
        }
        
        return groupByName;
      }
    }
    
    console.log("\n📍 [5] RESULT: NO GROUP FOUND");
    console.log(`   ⚠️ No group found for faculty: ${faculty_code}`);

    return null;
  } catch (error) {
    console.error("❌ Error in findMatchingGroup:", error);
    return null;
  }
};

module.exports = { findMatchingGroup };