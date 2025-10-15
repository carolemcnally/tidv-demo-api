import express from "express";
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10001;

app.get("/health", (req, res) => res.json({ ok: true, service: "guid" }));

app.get("/guid/:guid", (req, res) => {
  const { guid } = req.params;
  const nino = "AB123456C";
  res.json({ guid, nino });
});

app.get("/", (req, res) => res.send("GUID resolver service is running"));
app.listen(PORT, () => console.log(`GUID listening on ${PORT}`));
