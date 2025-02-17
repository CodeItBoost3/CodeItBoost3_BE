import * as dotenv from 'dotenv';
dotenv.config();


import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import moment from 'moment-timezone';
import { PrismaClient, Prisma } from '@prisma/client';
import userRouter from './user/routes/user.js';
import authRouter from './auth/routes/auth.js';
import postRouter from './post/routes/post.js';
import commentRouter from "./comment/routes/comment.js";
import scrapRouter from "./scrap/routes/scrap.js";
import groupRouter from "./group/routes/group.js"
import { errorHandler } from './error/error.js';
import { authenticateByToken } from './auth/routes/authToken.js';
import { checkDBConnection } from './config/db.js';


export const prisma = new PrismaClient();

checkDBConnection();

const app = express();
app.use(express.json());
app.use(cors());

morgan.token('timestamp', () => moment().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss'));
morgan.token('body', (req) => JSON.stringify(req.body) || 'empty');
morgan.token('user', (req) => (req.user ? `UserID: ${req.user.id}` : 'Guest'));
app.use(morgan('[:timestamp] :method :url :status :response-time ms - body: :body - :user'));

// 비동기 에러를 에러 핸들러로 전해주기 위한 고차함수
export function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 토큰 인증
app.use(

  wrapAsync(
    authenticateByToken.unless({
      path: [
        { url: "/users", methods: ["POST"] }, // 회원가입 제외
        { url: "/users/validation", methods: ["GET"] }, // 아이디 유일성 검사 제외
        { url: "/auth/login", methods: ["POST"] }, // 로그인 제외

        // 댓글 관련 API 추가
        { url: "/api/posts/:postId/comments", methods: ["POST", "GET"] }, // 댓글 등록, 조회
        { url: "/api/comments/:commentId", methods: ["PATCH", "DELETE"] }, // 댓글 수정, 삭제
        { url: "/api/comments/:commentId/like", methods: ["POST"] }, // 댓글 좋아요

        // 게시글 관련 API 추가
        { url: "/api/groups/:groupId/posts", methods: ["GET"] }, // 게시글 목록 조회
        { url: "/api/posts/:postId", methods: ["GET"] }, // 게시글 상세 조회
        { url: "/api/posts/:postId/is-public", methods: ["GET"] }, // 게시글 공개 유무 조회
      ],
    })
  )
);

// 라우팅
app.use('/users', userRouter);
app.use('/auth', authRouter);
app.use('/api/groups', postRouter);
app.use('/api/posts', postRouter);
app.use("/api", commentRouter);
app.use("/api", scrapRouter);
app.use("/api", groupRouter);

// 에러 핸들러(마지막에 위치 해야함)
app.use(errorHandler());

app.listen(process.env.PORT || 3000, () => console.log('Server Started'));

