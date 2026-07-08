import express from "express";

const PORT = process.env.PORT || 4004;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "catalog-service" });
});

app.listen(PORT, () => {
  console.log(`[catalog-service] listening on port ${PORT}`);
});