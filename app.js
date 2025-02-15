import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { assert } from "superstruct";
import userRouter from "./user/routes/user.js";
import authRouter from "./auth/routes/auth.js";
import commentRouter from "./comment/routes/comment.js";

export const prisma = new PrismaClient();

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

const app = express();
app.use(express.json());

app.use("/users", userRouter);
app.use("/auth", authRouter);
app.use("/api", commentRouter);

app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
