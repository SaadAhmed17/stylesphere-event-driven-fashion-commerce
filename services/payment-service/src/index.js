import express from "express";

const PORT = process.env.PORT || 4007;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "payment-service" });
});

app.listen(PORT, () => {
  console.log(`[payment-service] listening on port ${PORT}`);
});