import * as dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from 'cors';

import { PrismaClient, Prisma } from '@prisma/client';
import userRouter from './user/routes/user.js';
import authRouter from './auth/routes/auth.js';
import postRouter from './post/routes/post.js';
import commentRouter from "./comment/routes/comment.js";
import scrapRouter from "./scrap/routes/scrap.js";
import { errorHandler } from './error/error.js';
import { authenticateByToken } from './auth/routes/authToken.js';
import { checkDBConnection } from './config/db.js';


export const prisma = new PrismaClient();

checkDBConnection();

const app = express();
app.use(express.json());
app.use(cors());

// 비동기 에러를 에러 핸들러로 전해주기 위한 고차함수
export function wrapAsync(fn){
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 토큰 인증
app.use(
  wrapAsync(authenticateByToken.unless({
    path: [
      { url: "/users", methods: ["POST"] },  // 회원가입 제외
      { url: "/users/validation", methods: ["GET"] }, // 아이디 유일성 검사 제외
      { url: "/auth/login", methods: ["POST"] }, // 로그인 제외
    ],
  })
));

// 라우팅
app.use('/users', userRouter);
app.use('/auth', authRouter);
app.use('/api/groups', postRouter);
app.use('/api/posts', postRouter);
app.use("/api", commentRouter);
app.use("/api", scrapRouter);


// 에러 핸들러(마지막에 위치 해야함)
app.use(errorHandler());


app.listen(process.env.PORT || 3000, () => console.log('Server Started'));
