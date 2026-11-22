import express from "express";

const PORT = process.env.PORT || 4009;

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "wishlist-service" });
});

app.listen(PORT, () => {
  console.log(`[wishlist-service] listening on port ${PORT}`);
});