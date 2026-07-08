import express from "express";

const PORT = process.env.PORT || 4003;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

app.listen(PORT, () => {
  console.log(`[auth-service] listening on port ${PORT}`);
});