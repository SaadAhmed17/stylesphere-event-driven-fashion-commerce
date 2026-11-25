import express from "express";

const PORT = process.env.PORT || 4010;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "address-service" });
});

app.listen(PORT, () => {
  console.log(`[address-service] listening on port ${PORT}`);
});