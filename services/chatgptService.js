import OpenAI from "openai";
import express from "express";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const router = express.Router();

async function getRandomPrompt() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content:
            "커뮤니티에서 사진과 함께 추억을 공유할 수 있는 글감을 아무 주제나 추천해줘. " +
            "한국어 한 문장으로 대답해줘. 반말은 하지 말고, 권유하는 질문 형식으로 끝내줘.",
        },
      ],
      max_tokens: 50,
    });

    console.log("오늘의 추천 글감:", completion.choices[0].message.content);
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API 호출 오류:", error);
    return "글감을 가져올 수 없습니다.";
  }
}

router.get("/", async (req, res) => {
  const prompt = await getRandomPrompt();

  if (!prompt) {
    return res.status(500).json({
      status: "error",
      message: "글감 추천을 가져올 수 없습니다.",
      data: null
    });
  }

  res.json({
    status: "success",
    message: "랜덤 글감 추천 성공",
    data: { prompt }
  });
});

export default router;