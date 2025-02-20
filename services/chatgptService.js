import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getCompletion() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "커뮤니티를 하나 만들고 있는데, 사진과 함께 추억을 나눌만한 글감을 랜덤으로 골라서 한국어 딱 한 문장으로 추천해줘. 반말이나 대답은 하지 말고 권유하는 식의 질문으로 끝났으면 좋겠고 소재는 매번 다양했으면 좋겠어." }],
    });

    console.log("오늘의 추천 글감:", completion.choices[0].message.content);
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API 호출 오류:", error);
    return "응답을 가져올 수 없습니다.";
  }
}

getCompletion();
