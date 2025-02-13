import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { assert } from "superstruct";
import commentRouter from "./router/comment.js";

const prisma = new PrismaClient();

const app = express();
app.use(express.json());

app.use("/api", commentRouter);

async function checkDBConnection() {
  try {
    await prisma.$connect();
    console.log("✅ Database 연결 성공");
  } catch (error) {
    console.error("❌ Database 연결 실패:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDBConnection();

// 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 서버가 http://localhost:${PORT}에서 실행 중입니다.`);
});
