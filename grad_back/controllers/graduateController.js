const asyncHandler = require("express-async-handler");
const { Graduate, User } = require("../models");
const XLSX = require("xlsx");

/**
 * POST /api/graduates
 * Handle both JSON data and file uploads (Excel, JSON, CSV)
 * Works with or without JWT
 */
const addGraduates = asyncHandler(async (req, res) => {
  // ============================================
  // 🚀 addGraduates CALLED
  // ============================================
  console.log("\n" + "📝".repeat(30));
  console.log("📝 ADD GRADUATES FUNCTION CALLED at:", new Date().toISOString());
  console.log("📝".repeat(30));

  // ✅ فقط من req.user (اللي جاي من التوكن) - مش من req.body
  const currentUserId = req.user?.id;
  
  console.log("\n📌 [1] USER AUTHENTICATION:");
  console.log("   - req.user exists:", req.user ? "✅ Yes" : "❌ No");
  console.log("   - Current user ID from token:", currentUserId || "❌ Not provided");
  
  if (req.user) {
    console.log("   - User email:", req.user.email);
    console.log("   - User full_name:", req.user.full_name);
    console.log("   - User ID:", req.user.id);
  }

  // التحقق من وجود userId
  if (!currentUserId) {
    console.log("   ❌ No user ID in request - authentication failed");
    return res.status(401).json({ message: "Not authenticated" });
  }

  const results = { added: 0, duplicates: 0, errors: [], invalidStructure: 0 };
  const addedGraduates = [];
  let graduatesArray = [];

  // ضبط الوقت المحلي (UTC+2)
  const now = new Date();
  let localTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const year = localTime.getFullYear();
  const month = String(localTime.getMonth() + 1).padStart(2, "0");
  const day = String(localTime.getDate()).padStart(2, "0");
  const hours = String(localTime.getHours()).padStart(2, "0");
  const minutes = String(localTime.getMinutes()).padStart(2, "0");
  const seconds = String(localTime.getSeconds()).padStart(2, "0");

  const localTimestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  const batchId = `batch_${localTimestamp}_${Math.random()
    .toString(36)
    .substr(2, 6)}`;
  
  console.log("\n📌 [2] BATCH INFO:");
  console.log("   - Batch ID:", batchId);
  console.log("   - Local time:", `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`);

  try {
    // استخراج بيانات الخريجين
    console.log("\n📌 [3] EXTRACTING GRADUATES DATA:");
    
    if (req.files && req.files.length > 0) {
      console.log("   - Processing uploaded file...");
      console.log("   - File details:", {
        filename: req.files[0].originalname,
        mimetype: req.files[0].mimetype,
        size: req.files[0].size + " bytes"
      });
      graduatesArray = await processUploadedFile(req.files[0]);
      console.log(`   - Extracted ${graduatesArray.length} records from file`);
    } else if (req.body && req.body.graduates) {
      console.log("   - Processing req.body.graduates");
      graduatesArray = Array.isArray(req.body.graduates)
        ? req.body.graduates
        : [req.body.graduates];
      console.log(`   - Found ${graduatesArray.length} graduates in body`);
    } else if (isManualEntryData(req.body)) {
      console.log("   - Processing manual entry data");
      graduatesArray = [req.body];
      console.log("   - Found 1 manual entry");
    } else if (Array.isArray(req.body)) {
      console.log("   - Processing array body");
      graduatesArray = req.body;
      console.log(`   - Found ${graduatesArray.length} items in array`);
    } else {
      console.log("   ❌ No data provided!");
      return res.status(400).json({ message: "No data provided" });
    }

    if (graduatesArray.length === 0) {
      console.log("   ❌ No valid data found!");
      return res.status(400).json({ message: "No valid data found" });
    }

    console.log("\n📌 [4] GRADUATES DATA PREVIEW:");
    graduatesArray.forEach((grad, index) => {
      if (index < 3) { // اعرض أول 3 بس عشان ما يطولش
        console.log(`   - Graduate ${index + 1}:`, JSON.stringify(grad, null, 2));
      }
    });
    if (graduatesArray.length > 3) {
      console.log(`   - ... and ${graduatesArray.length - 3} more`);
    }

    console.log("\n📌 [5] FETCHING CURRENT USER FROM DATABASE:");
    const currentUser = await User.findByPk(currentUserId);
    console.log("   - User found in database:", currentUser ? "✅ Yes" : "❌ No");
    
    if (currentUser) {
      console.log("   - User email from DB:", currentUser.email);
      console.log("   - User name from DB:", currentUser.full_name);
    }

    // معالجة كل خريج
    console.log("\n📌 [6] PROCESSING EACH GRADUATE:");
    
    for (let i = 0; i < graduatesArray.length; i++) {
      const graduateData = graduatesArray[i];
      console.log(`\n   🔄 Processing graduate ${i + 1}/${graduatesArray.length}`);
      
      try {
        // Normalize data
        console.log(`      - Normalizing data...`);
        const normalizedData = normalizeGraduateData(graduateData);
        console.log(`      - Normalized:`, {
          fullName: normalizedData.fullName,
          nationalId: normalizedData.nationalId,
          faculty: normalizedData.faculty,
          department: normalizedData.department,
          graduationYear: normalizedData.graduationYear
        });
        
        // Validate structure
        console.log(`      - Validating structure...`);
        const validationResult = validateGraduateStructure(normalizedData);
        if (!validationResult.isValid) {
          console.log(`      ❌ Validation failed:`, validationResult.message);
          results.invalidStructure++;
          results.errors.push({
            data: normalizedData,
            error: validationResult.message,
          });
          continue;
        }
        console.log(`      ✅ Validation passed`);

        // Check for duplicates
        console.log(`      - Checking for duplicates (national_id: ${normalizedData.nationalId})...`);
        const existingGraduate = await Graduate.findOne({
          where: { national_id: normalizedData.nationalId },
        });
        
        if (existingGraduate) {
          console.log(`      ❌ Duplicate found!`);
          results.duplicates++;
          results.errors.push({
            nationalId: normalizedData.nationalId,
            error: "Duplicate",
          });
          continue;
        }
        console.log(`      ✅ No duplicate found`);

        // Create graduate
        console.log(`      - Creating graduate in database...`);
        console.log(`        Data being saved:`, {
          full_name: normalizedData.fullName,
          national_id: normalizedData.nationalId,
          faculty: normalizedData.faculty,
          department: normalizedData.department,
          graduation_year: normalizedData.graduationYear,
          created_by: currentUserId, // دي هتاخد القيمة من التوكن
          batch_id: batchId,
          created_at: localTime,
        });

        const newGraduate = await Graduate.create({
          full_name: normalizedData.fullName,
          national_id: normalizedData.nationalId,
          faculty: normalizedData.faculty,
          department: normalizedData.department,
          graduation_year: normalizedData.graduationYear,
          created_by: currentUserId, // ✅ مستخدمة currentUserId من التوكن
          batch_id: batchId,
          created_at: localTime,
        });

        console.log(`      ✅ Graduate created successfully! ID: ${newGraduate.id}`);
        console.log(`        - full_name: ${newGraduate.full_name}`);
        console.log(`        - national_id: ${newGraduate.national_id}`);

        results.added++;
        addedGraduates.push({
          fullName: newGraduate.full_name,
          nationalId: newGraduate.national_id,
          faculty: newGraduate.faculty,
          department: newGraduate.department,
          graduationYear: newGraduate.graduation_year,
        });
        
      } catch (error) {
        console.log(`      ❌ ERROR in graduate ${i + 1}:`, error.message);
        console.log(`        Error name:`, error.name);
        console.log(`        Error stack:`, error.stack);
        results.errors.push({ 
          data: graduateData, 
          error: error.message,
          stack: error.stack 
        });
      }
    }

    // عرض النتائج النهائية
    console.log("\n📌 [7] FINAL RESULTS:");
    console.log("   - Total processed:", graduatesArray.length);
    console.log("   - Added:", results.added);
    console.log("   - Duplicates:", results.duplicates);
    console.log("   - Invalid structure:", results.invalidStructure);
    console.log("   - Errors:", results.errors.length);
    
    if (results.errors.length > 0) {
      console.log("\n📌 [8] ERROR DETAILS:");
      results.errors.forEach((err, idx) => {
        console.log(`   Error ${idx + 1}:`, err);
      });
    }

    console.log("\n📌 [9] RESPONSE:");
    const response = {
      message: `Processed ${graduatesArray.length} graduates`,
      metadata: {
        batchId,
        createdBy: currentUser?.email,
        createdByName: currentUser?.full_name,
        createdAt: localTime.toISOString(),
        localCreatedAt: `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`,
      },
      results,
      addedGraduates,
    };
    console.log(JSON.stringify(response, null, 2));
    console.log("📝".repeat(30) + "\n");

    res.json(response);
    
  } catch (error) {
    console.log("\n❌❌❌ CATCH BLOCK ERROR:");
    console.log("Error message:", error.message);
    console.log("Error stack:", error.stack);
    console.log("❌❌❌\n");
    
    res
      .status(500)
      .json({ message: "Error processing data", error: error.message });
  }
});

// -------------------- دوال مساعدة --------------------

function isManualEntryData(data) {
  return (
    data &&
    (data.fullName ||
      data.nationalId ||
      data.faculty ||
      data.department ||
      data.graduationYear)
  );
}

function normalizeGraduateData(data) {
  const normalized = {
    fullName:
      data.fullName ||
      data.full_name ||
      data["Full Name"] ||
      data["full name"] ||
      data["الاسم بالكامل"] ||
      data["اسم الطالب"] ||
      data["Name"] ||
      data["name"],
    nationalId:
      data.nationalId ||
      data.national_id ||
      data["National ID"] ||
      data["national id"] ||
      data["رقم قومي"] ||
      data["ID"] ||
      data["id"],
    faculty:
      data.faculty ||
      data["Faculty"] ||
      data["faculty"] ||
      data["كلية"] ||
      data["الكليه"],
    department:
      data.department ||
      data["Department"] ||
      data["department"] ||
      data["قسم"] ||
      data["القسم"],
    graduationYear:
      data.graduationYear ||
      data.graduation_year ||
      data["Graduation Year"] ||
      data["graduation year"] ||
      data["سنة التخرج"] ||
      data["Year"] ||
      data["year"],
  };

  if (
    normalized.graduationYear &&
    typeof normalized.graduationYear === "string"
  ) {
    const year = parseInt(normalized.graduationYear);
    if (!isNaN(year)) normalized.graduationYear = year;
  }
  return normalized;
}

function validateGraduateStructure(data) {
  const requiredFields = [
    "fullName",
    "nationalId",
    "faculty",
    "department",
    "graduationYear",
  ];
  for (const field of requiredFields)
    if (!data[field])
      return { isValid: false, message: `Missing required field: ${field}` };

  const year = parseInt(data.graduationYear);
  if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 5)
    return { isValid: false, message: "graduationYear must be a valid year" };

  return { isValid: true };
}

async function processUploadedFile(file) {
  switch (file.mimetype) {
    case "application/json":
      return processJSONFile(file);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return processExcelFile(file);
    case "text/csv":
      return processCSVFile(file);
    default:
      throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
}

function processJSONFile(file) {
  try {
    const data = JSON.parse(file.buffer.toString("utf8"));
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
}

function processExcelFile(file) {
  try {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    let jsonData = XLSX.utils.sheet_to_json(worksheet);
    if (jsonData.length === 0) {
      const alternativeData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      });
      if (alternativeData.length > 1) {
        const headers = alternativeData[0];
        jsonData = alternativeData.slice(1).map((row) => {
          const obj = {};
          headers.forEach((h, i) => (obj[h] = row[i]));
          return obj;
        });
      }
    }
    return jsonData
      .map(normalizeGraduateData)
      .filter((i) => i && i.nationalId && i.nationalId.trim() !== "");
  } catch (error) {
    throw new Error(`Error processing Excel file: ${error.message}`);
  }
}

function processCSVFile(file) {
  return processExcelFile(file);
}

// -------------------- باقي دوال CRUD --------------------

const getGraduatesByBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  try {
    const graduates = await Graduate.findAll({
      where: { batch_id: batchId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email", "full_name"],
        },
      ],
      order: [["full_name", "ASC"]],
    });
    if (graduates.length === 0)
      return res
        .status(404)
        .json({ message: "No graduates found for this batch" });

    res.json({
      batchId,
      totalGraduates: graduates.length,
      graduates: graduates.map((g) => ({
        fullName: g.full_name,
        nationalId: g.national_id,
        faculty: g.faculty,
        department: g.department,
        graduationYear: g.graduation_year,
        createdBy: g.creator?.email,
        createdByName: g.creator?.full_name,
        createdAt: g.created_at,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching batch graduates",
      error: error.message,
    });
  }
});

const deleteGraduatesByBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  try {
    const batchGraduates = await Graduate.findAll({
      where: { batch_id: batchId },
      attributes: ["national_id", "full_name"],
    });
    if (batchGraduates.length === 0)
      return res
        .status(404)
        .json({ message: "No graduates found for this batch" });

    const deletedCount = await Graduate.destroy({
      where: { batch_id: batchId },
    });
    res.json({
      message: `Successfully deleted batch ${batchId}`,
      deletedCount,
      batchInfo: {
        batchId,
        totalDeleted: deletedCount,
        sampleGraduates: batchGraduates
          .slice(0, 5)
          .map((g) => ({ fullName: g.full_name, nationalId: g.national_id })),
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting batch graduates",
      error: error.message,
    });
  }
});

const getAllBatches = asyncHandler(async (req, res) => {
  try {
    const allGraduates = await Graduate.findAll({
      attributes: ["batch_id", "created_at"],
      include: [
        { model: User, as: "creator", attributes: ["email", "full_name"] },
      ],
      order: [["created_at", "DESC"]],
    });
    const batchMap = new Map();
    allGraduates.forEach((g) => {
      if (!batchMap.has(g.batch_id))
        batchMap.set(g.batch_id, {
          batchId: g.batch_id,
          graduateCount: 0,
          createdAt: g.created_at,
          createdBy: g.creator?.email,
          createdByName: g.creator?.full_name,
        });
      batchMap.get(g.batch_id).graduateCount++;
    });

    const batches = Array.from(batchMap.values()).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json({ totalBatches: batches.length, batches });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching batches", error: error.message });
  }
});

const getAllGraduates = asyncHandler(async (req, res) => {
  try {
    const allGraduates = await Graduate.findAll({
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "email", "full_name"],
        },
      ],
      order: [
        ["created_at", "DESC"],
        ["full_name", "ASC"],
      ],
    });

    // ✅ تغيير مهم: لو مفيش بيانات، رجع 200 مش 404
    if (allGraduates.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No graduates found in the database",
        totalGraduates: 0,
        graduates: [],
      });
    }

    const allGraduatesFlat = allGraduates.map((g) => ({
      fullName: g.full_name,
      nationalId: g.national_id,
      faculty: g.faculty,
      department: g.department,
      graduationYear: g.graduation_year,
    }));

    res.status(200).json({
      success: true,
      totalGraduates: allGraduatesFlat.length,
      graduates: allGraduatesFlat,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching all graduates",
      error: error.message,
    });
  }
});
/**
 * GET /api/graduate/details/:nationalId
 * Get complete graduate details by national ID
 */
const getGraduateDetails = asyncHandler(async (req, res) => {
  const { nationalId } = req.params;
  
  console.log("\n🔍 FETCHING GRADUATE DETAILS FOR NATIONAL ID:", nationalId);
  
  const graduate = await Graduate.findOne({
    where: { national_id: nationalId },
    attributes: [
      'full_name',
      'national_id',
      'faculty',
      'department',
      'graduation_year'
    ]
  });
  
  if (!graduate) {
    console.log("❌ Graduate not found for national ID:", nationalId);
    return res.status(404).json({ 
      message: "Graduate not found",
      nationalId 
    });
  }
  
  console.log("✅ Graduate found:", graduate.toJSON());
  
  res.json({
    id: graduate.id,
    fullName: graduate.full_name,
    nationalId: graduate.national_id,
    faculty: graduate.faculty,
    department: graduate.department,
    graduationYear: graduate.graduation_year
  });
});


module.exports = {
  addGraduates,
  getGraduatesByBatch,
  deleteGraduatesByBatch,
  getAllBatches,
  getAllGraduates,
  getGraduateDetails
};
