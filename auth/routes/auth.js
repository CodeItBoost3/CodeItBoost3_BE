import express from "express";
import { prisma } from "../../app.js";
import bcrypt from "bcrypt";
import { errorHandler, CustomError } from "../../error/error.js";
import jwt from "jsonwebtoken";

const authRouter = express.Router();

authRouter.post(
  "/login",
  errorHandler(async (req, res, next) => {
    try {
      const { clientId, password } = req.body;
      console.log("로그인 시도:", { clientId });
      // 1. ID 등록 확인
      const user = await prisma.user.findUnique({
        select: {
          id: true,
          password: true,
          role: true,
        },
        where: {
          clientId,
        },
      });
      console.log("조회된 사용자:", user);
      if (!user) {
        throw new CustomError(404, "일치하는 ID가 없습니다.");
      }

      // 2. 비밀번호 일치여부 확인
      if (!(await bcrypt.compare(password, user.password))) {
        throw new CustomError(401, "비밀번호가 일치하지 않습니다.");
      }

      try {
        const token = generateToken(user);
        const decoded = jwt.decode(token);

        res.send({
          status: "success",
          message: "로그인에 성공하였습니다.",
          data: {
            accessToken: token,
            tokenType: "Bearer",
            expiresln: decoded.exp,
          },
        });
      } catch (tokenError) {
        console.error("토큰 생성 중 에러:", tokenError);
        throw new CustomError(500, "토큰 생성에 실패했습니다.");
      }
    } catch (error) {
      console.error("로그인 처리 중 에러:", error);
      next(error);
    }
  })
);

function generateToken(user) {
  console.log(process.env.TOKEN_EXPIRATION);
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.TOKEN_EXPIRATION,
  });
}

export default authRouter;
