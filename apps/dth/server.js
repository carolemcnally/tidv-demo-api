import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BASE_HOST = process.env.BASE_HOST || `localhost:${PORT}`;
const SCHEME = process.env.BASE_SCHEME || "https";
const BASE = `${SCHEME}://${BASE_HOST}`;
const BENEFITS = process.env.BENEFITS_BASE || `${SCHEME}://${process.env.BENEFITS_HOST || BASE_HOST}`;
const KONG = process.env.KONG_BASE || `${SCHEME}://${process.env.KONG_HOST || BASE_HOST}`;
const ACCESS = process.env.ACCESS_BASE || `${SCHEME}://${process.env.ACCESS_HOST || BASE_HOST}`;

const BEARER = process.env.DEMO_BEARER_TOKEN || process.env.TOKEN || "demo_token";
const REDIRECT_MODE = String(process.env.REDIRECT_MODE || "true").toLowerCase() === "true";

// ------------------ AUTH CHECK ------------------
const requireBearer = (req, res, next) => {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  console.log("💬 Received token:", JSON.stringify(token));
  console.log("🔐 Expected BEARER:", JSON.stringify(BEARER));
  if (token !== BEARER) {
    console.warn("🚫 Invalid token!");
    return res.status(401).json({ error: "invalid bearer" });
  }
  next();
};

// ------------------ BASIC ROUTES ------------------
const sendRedirect = (res, location) => res.set("Location", location).status(302).send();
const sendLocationJson = (res, location) => res.json({ location });

app.get("/health", (req, res) => res.json({ ok: true, service: "dth", base: BASE }));

app.get("/payments/:benefitType", (req, res) => {
  const { benefitType } = req.params;
  const authzUrl = `${KONG}/authorize?client_id=CxP-${(benefitType || "ESA").toUpperCase()}-TIDV&state=abc123`;
  return REDIRECT_MODE ? sendRedirect(res, authzUrl) : sendLocationJson(res, authzUrl);
});

app.get("/authorize", (req, res) => {
  const authnUrl = `${ACCESS}/authenticate?signInToken=tok_001`;
  return REDIRECT_MODE ? sendRedirect(res, authnUrl) : sendLocationJson(res, authnUrl);
});

app.get("/authenticate", (req, res) => {
  return res.json({
    authId: "auth_001",
    callbacks: [{ output: [{ name: "prompt", value: "Enter CLI telephone number" }] }]
  });
});

app.post("/authenticate", (req, res) => {
  const { authId } = req.body || {};
  if (authId === "auth_001") {
    return res.json({
      authId: "auth_002",
      callbacks: [{ output: [{ name: "prompt", value: "Enter DOB dd/mm/yyyy" }] }]
    });
  }
  if (authId === "auth_002") {
    return res.json({
      authId: "auth_003",
      callbacks: [{ output: [{ name: "prompt", value: "KBV: pip_components" }] }]
    });
  }
  if (authId === "auth_003") {
    const outcomeUrl = `${KONG}/authorize-outcome?state=abc123`;
    return REDIRECT_MODE ? sendRedirect(res, outcomeUrl) : res.json({ location: outcomeUrl });
  }
  return res.status(401).json({
    message: "Authentication failed",
    detail: { failureUrl: "/failures/NO_KBVS_CORRECT" },
    code: "NO_KBVS_CORRECT"
  });
});

app.get("/authorize-outcome", (req, res) => {
  const next = `${BENEFITS}/payments/esa?code=code_demo_001`;
  return REDIRECT_MODE ? sendRedirect(res, next) : res.json({ code: "code_demo_001" });
});

app.post("/token", (req, res) => {
  return res.json({ access_token: "demo_access_123", id_token: "demo_id_456", expires_in: 14400 });
});

app.post("/introspect", (req, res) => {
  const level = Number(process.env.FORCE_AUTH_LEVEL || "2");
  return res.json({ auth_level: level, guid: "GUID_DEMO_001", active: true });
});

app.get("/protected/payments/:benefitType", requireBearer, (req, res) => {
  res.set("X-GUID", "GUID_DEMO_001");
  return res.json({ paymentDate: "2025-10-15", paymentAmount: 210.75 });
});

app.get("/idv-failure", requireBearer, (req, res) => {
  return res.json({
    failureReasons: ["NO_KBVS_CORRECT"],
    kbv: [
      { question: "cis_childs_dob", pass: false },
      { question: "pip_components", pass: false }
    ],
    confidenceLevel: 0
  });
});

// ------------------ VALIDATE ENDPOINT ------------------
app.post("/validate", requireBearer, (req, res) => {
  console.log("Incoming headers:", req.headers);
  const { dob, phone } = req.body || {};

  // Normalize DOB input
 const normalizeDob = (d) => {
  if (!d) return d;
  
  const str = String(d).trim();
  
  // If already in DD-MM-YYYY format, return as-is
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }
  
  // If in YYYY-MM-DD format (ISO from Omilia)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const dateOnly = str.substring(0, 10);
    const [year, month, day] = dateOnly.split('-');
    
    // WORKAROUND: Omilia sends MM-DD instead of DD-MM in ISO format
    // So swap them back: treat "month" as day and "day" as month
    return `${month}-${day}-${year}`;  // Swapped!
  }
  
  // Fallback
  return str;
};

  const normalizedDob = normalizeDob(dob);
  console.log("Raw DOB:", dob);
  console.log("Normalized DOB:", normalizedDob);

  const demoValues = {
    dob: "01-05-1975",
    phone: "07983215336"
  };

  // Match flags
  const dobMatches = normalizedDob === demoValues.dob;
  const phoneMatches = phone === demoValues.phone;

  let errorStatus;
  if (dobMatches && phoneMatches) {
    errorStatus = 0;
  } else if (dobMatches || phoneMatches) {
    errorStatus = 1;
  } else {
    errorStatus = 2;
  }

  const response = {
    dob: normalizedDob,
    phone: phone,
    errorStatus,
    match: errorStatus === 0,
    message: errorStatus === 0 ? "Validation successful" : "Validation failed",
    confidenceLevel: errorStatus === 0 ? 3 : 0,
    guid: errorStatus === 0 ? "GUID_DEMO_001" : ""
  };

  console.log(` Matches: dob=${dobMatches}, phone=${phoneMatches} → errorStatus=${errorStatus}`);

  return res.type("application/json").status(200).json(response);
});
// ------------------ VALIDATE POSTCODE & NINO ENDPOINT ------------------
app.post("/validate-postcode-nino", requireBearer, (req, res) => {
  console.log("Incoming headers:", req.headers);
  const { postcode, nino } = req.body || {};

  // Normalize postcode (remove spaces, uppercase)
  const normalizePostcode = (pc) => {
    if (!pc) return pc;
    return String(pc).replace(/\s+/g, '').toUpperCase();
  };

  // Normalize NINO (remove spaces, uppercase)
  const normalizeNino = (n) => {
    if (!n) return n;
    return String(n).replace(/\s+/g, '').toUpperCase();
  };

  const normalizedPostcode = normalizePostcode(postcode);
  const normalizedNino = normalizeNino(nino);
  
  console.log("Raw Postcode:", postcode);
  console.log("Normalized Postcode:", normalizedPostcode);
  console.log("Raw NINO:", nino);
  console.log("Normalized NINO:", normalizedNino);

  // Demo values to match against
  const demoValues = {
    postcode: "N225QH",  // No spaces, uppercase
    nino: "JC735092A"    // No spaces, uppercase
  };

  // Match flags
  const postcodeMatches = normalizedPostcode === demoValues.postcode;
  const ninoMatches = normalizedNino === demoValues.nino;

  let errorStatus;
  let failedField = null;
  
  if (postcodeMatches && ninoMatches) {
    errorStatus = 0;  // Both matched
  } else if (postcodeMatches || ninoMatches) {
    errorStatus = 1;  // One matched
    failedField = !postcodeMatches ? "postcode" : "nino";
  } else {
    errorStatus = 2;  // Both failed
  }

  const response = {
    postcode: normalizedPostcode,
    nino: normalizedNino,
    errorStatus,
    match: errorStatus === 0,
    message: errorStatus === 0 ? "Validation successful" : "Validation failed",
    confidenceLevel: errorStatus === 0 ? 3 : 0,
    guid: errorStatus === 0 ? "GUID_DEMO_001" : "",
    failedField: failedField
  };

  console.log(`✓ Matches: postcode=${postcodeMatches}, nino=${ninoMatches} → errorStatus=${errorStatus}`);

  return res.type("application/json").status(200).json(response);
});

// ------------------ VALIDATE ALL FIELDS ENDPOINT ------------------
app.post("/validate-all", requireBearer, (req, res) => {
  try {
    console.log("Incoming headers:", req.headers);
    console.log("Request body type:", typeof req.body);
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    // Check if body exists
    if (!req.body || typeof req.body !== 'object') {
      console.error("❌ Invalid body type");
      return res.status(400).json({
        error: "Invalid request body",
        errorStatus: 2,
        matchCount: 0,
        totalFields: 4,
        matchedFields: [],
        failedFields: ["dob", "phone", "postcode", "nino"],
        match: false,
        message: "Invalid or missing request body"
      });
    }

    const { dob, phone, postcode, nino } = req.body;

    // Log what we received
    console.log("Extracted fields:", { dob, phone, postcode, nino });

    // Normalize DOB input
    const normalizeDob = (d) => {
      if (!d) return d;
      const str = String(d).trim();
      if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
        return str;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        const dateOnly = str.substring(0, 10);
        const [year, month, day] = dateOnly.split('-');
        return `${month}-${day}-${year}`;
      }
      return str;
    };

    // Normalize postcode (remove spaces, uppercase)
    const normalizePostcode = (pc) => {
      if (!pc) return pc;
      return String(pc).replace(/\s+/g, '').toUpperCase();
    };

    // Normalize NINO (remove spaces, uppercase)
    const normalizeNino = (n) => {
      if (!n) return n;
      return String(n).replace(/\s+/g, '').toUpperCase();
    };

    // Normalize phone (keep as-is for now)
    const normalizePhone = (p) => {
      if (!p) return p;
      return String(p).trim();
    };

    const normalizedDob = normalizeDob(dob);
    const normalizedPhone = normalizePhone(phone);
    const normalizedPostcode = normalizePostcode(postcode);
    const normalizedNino = normalizeNino(nino);

    console.log("Raw inputs:", { dob, phone, postcode, nino });
    console.log("Normalized:", { 
      dob: normalizedDob, 
      phone: normalizedPhone, 
      postcode: normalizedPostcode, 
      nino: normalizedNino 
    });

    // Demo values to match against
    const demoValues = {
      dob: "01-05-1975",
      phone: "07983215336",
      postcode: "N225QH",
      nino: "JC735092A"
    };

    // Check each field
    const dobMatches = normalizedDob === demoValues.dob;
    const phoneMatches = normalizedPhone === demoValues.phone;
    const postcodeMatches = normalizedPostcode === demoValues.postcode;
    const ninoMatches = normalizedNino === demoValues.nino;

    // Determine which fields matched
    const matchedFields = [];
    const failedFields = [];

    if (dobMatches) matchedFields.push("dob");
    else failedFields.push("dob");

    if (phoneMatches) matchedFields.push("phone");
    else failedFields.push("phone");

    if (postcodeMatches) matchedFields.push("postcode");
    else failedFields.push("postcode");

    if (ninoMatches) matchedFields.push("nino");
    else failedFields.push("nino");

    const matchCount = matchedFields.length;
    const totalFields = 4;

    // Determine error status
    let errorStatus;
    if (matchCount === 4) {
      errorStatus = 0;
    } else if (matchCount >= 2) {
      errorStatus = 1;
    } else {
      errorStatus = 2;
    }

    const response = {
      dob: normalizedDob,
      phone: normalizedPhone,
      postcode: normalizedPostcode,
      nino: normalizedNino,
      matchCount,
      totalFields,
      matchedFields,
      failedFields,
      errorStatus,
      match: errorStatus === 0,
      message: errorStatus === 0 ? "All fields validated successfully" : 
               errorStatus === 1 ? "Partial validation" : "Validation failed",
      confidenceLevel: errorStatus === 0 ? 3 : errorStatus === 1 ? 2 : 0,
      guid: errorStatus === 0 ? "GUID_DEMO_001" : ""
    };

    console.log(`✓ Matches: ${matchCount}/${totalFields} - ${matchedFields.join(', ')} → errorStatus=${errorStatus}`);

    return res.type("application/json").status(200).json(response);
    
  } catch (error) {
    console.error("❌ Error in /validate-all:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
      errorStatus: 2,
      matchCount: 0,
      totalFields: 4,
      matchedFields: [],
      failedFields: ["dob", "phone", "postcode", "nino"],
      match: false
    });
  }
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => console.log(`🚀 DTH listening on port ${PORT}`));
