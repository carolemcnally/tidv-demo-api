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
  console.log("📥 Incoming headers:", req.headers);
  const { dob, postcode, nino, phone } = req.body || {};

const normalizeDob = (d) => {
  if (!d) return d;
  const date = new Date(d);
  if (isNaN(date)) return d; // fallback

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
};



  const normalizedDob = normalizeDob(dob);
  console.log("📥 Raw DOB:", dob);
  console.log("🧩 Normalized DOB:", normalizedDob);

  const demoValues = {
    dob: "01-01-1975",
    postcode: "N22 5QH",
    nino: "JC735092A",
    phone: "07983215336"
  };

  const failures = [];
  if (normalizedDob && normalizedDob !== demoValues.dob) failures.push("dob");
  if (postcode && postcode !== demoValues.postcode) failures.push("postcode");
  if (nino && nino !== demoValues.nino) failures.push("nino");
  if (phone && phone !== demoValues.phone) failures.push("phone");

  const match = failures.length === 0;
  console.log(match ? "Validation success" : `Validation failed. Fields: ${failures}`);

  if (!match) {
    return res
      .type("application/json")
      .status(401)
      .json({
        match: false,
        message: "Validation failed",
        failedFields: failures
      });
  }

  return res
    .type("application/json")
    .json({
      match: true,
      message: "Validation successful",
      confidenceLevel: 3,
      guid: "GUID_DEMO_001"
    });
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => console.log(`🚀 DTH listening on port ${PORT}`));
