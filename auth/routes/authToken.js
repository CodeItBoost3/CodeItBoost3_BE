import { CustomError } from "../../error/error.js";
import { unless } from 'express-unless';
import jwt from 'jsonwebtoken';

export function authenticateByToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <TOKEN>"

  if (!token) {
    next(new CustomError(401, '토큰을 읽어올 수 없습니다.'));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      throw new CustomError(401, err.message.split('<br>')[0]);
    }
    req.user = user;
    console.log(req.user);
    next();
  });
};

authenticateByToken.unless = unless;