import express from "express";

const PORT = process.env.PORT || 4008;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "cart-service" });
});

app.listen(PORT, () => {
  console.log(`[cart-service] listening on port ${PORT}`);
});