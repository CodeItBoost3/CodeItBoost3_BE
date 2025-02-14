import express from 'express';
import { prisma } from '../../app.js';
import bcrypt from 'bcrypt';
import { errorHandler, CustomError } from '../../error/error.js'
import jwt from 'jsonwebtoken';
import { wrapAsync } from '../../app.js';


const authRouter = express.Router()


authRouter.post('/login', wrapAsync(async (req, res, next) =>{
  const { clientId, password } = req.body;
  // 1. ID 등록 확인
  const user = await prisma.user.findUnique({
    select: {
      id: true,
      password: true,
      role: true,
    },
    where: { 
      clientId 
    },
  });
  if(!user){
    throw new CustomError(404, '일치하는 ID가 없습니다.');
  }
  
  // 2. 비밀번호 일치여부 확인
  if (!await bcrypt.compare(password, user.password)){
    throw new CustomError(401, '비밀번호가 일치하지 않습니다.');
  }
  const token = generateToken(user)
  const decoded = jwt.decode(token)

  res.send({
    status: 'success',
    message: '로그인에 성공하였습니다.',
    data:{
      accessToken: token,
      tokenType: 'Bearer',
      expiresln: decoded.exp
    }
  })
}))

function generateToken(user) {
  console.log(user)
  return jwt.sign(
      { id: user.id, role: user.role },  
      process.env.JWT_SECRET,  
      { expiresIn: process.env.TOKEN_EXPIRATION }  
  );
}


export default authRouter;