import express from "express";

const PORT = process.env.PORT || 4006;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "order-service" });
});

app.listen(PORT, () => {
  console.log(`[order-service] listening on port ${PORT}`);
});