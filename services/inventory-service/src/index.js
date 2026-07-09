import express from "express";

const PORT = process.env.PORT || 4005;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "inventory-service" });
});

app.listen(PORT, () => {
  console.log(`[inventory-service] listening on port ${PORT}`);
});