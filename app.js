import * as dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from "cors";

import { PrismaClient, Prisma } from '@prisma/client';
import userRouter from './user/routes/user.js';
import authRouter from './auth/routes/auth.js';
import groupRouter from "./group/routes/group.js";
// import postRouter from './post/routes/post.js';
// import commentRouter from "./comment/routes/comment.js";
import { errorHandler } from './error/error.js';
import { authenticateByToken } from './auth/routes/authToken.js';
import { checkDBConnection } from './config/db.js';

export const prisma = new PrismaClient();

checkDBConnection();

const app = express();
app.use(express.json());
app.use(cors());

// 비동기 에러를 에러 핸들러로 전해주기 위한 고차함수
export function wrapAsync(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// 토큰 인증
app.use(
    wrapAsync(authenticateByToken.unless({
        path: [
            { url: "/users", methods: ["POST"] },
            { url: "/users/validation", methods: ["GET"] },
            { url: "/auth/login", methods: ["POST"] },
            { url: "/api/groups", methods: ["GET"] },
            { url: "/api/groups/search", methods: ["GET"] },
            /^\/api\/groups\/\d+\/is-public$/  // 동적 경로를 위해 정규식 사용했음
        ],
    }))
);

// 라우팅
app.use('/users', userRouter);
app.use('/auth', authRouter);
app.use('/api/groups', groupRouter);
// app.use('/api/posts', postRouter);
// app.use("/api", commentRouter);

// 에러 핸들러(마지막에 위치 해야함)
app.use(errorHandler());

app.listen(process.env.PORT || 3000, () => console.log('Server Started'));