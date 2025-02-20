import express from "express";
import { getCompletion } from "../chatgptService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { topic } = req.query;
  if (!topic) return res.status(400).json({ message: "주제를 입력해주세요." });

  const prompt = await getCompletion(topic);
  res.json({ prompt });
});

export default router;