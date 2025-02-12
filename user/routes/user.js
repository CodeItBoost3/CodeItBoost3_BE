import express from 'express';
import { prisma } from '../../app.js';
import { createUser }from '../userStructs.js';
import { assert } from 'superstruct';
import bcrypt from 'bcrypt';

const userRouter = express.Router();

userRouter.get('/me', async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      nickname: true,
    }
  })
  res.send(user)
})

  .post('/', async (req, res, next) => {
    console.log(req.body);
    assert(req.body, createUser);
    const { clientId, password, nickname } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        clientId,
        password: hashedPassword,
        nickname,
      },
      omit: {
        password: true
      }
    });
    res.status(201).send(createResponse('success', '회원가입에 성공했습니다.', user));
  })

  .put('/me', async (req, res, next) => {
    assert(req.body, createUser)
    prisma.user.update({
      where: { id: req.user.id },
      data: req.body
    });
  })
  
  .get('/validation', async (req, res, next) => {
    const clientId = req.query["client-id"];
    const user = await prisma.user.findUnique({
      where: {
        clientId
      }
    });
    if(user){
      res.status(400).json(createResponse('fail', '이미 존재하는 ID입니다.', {}))
    }
    res.json(createResponse('success', '사용 가능한 ID입니다.', {}));
  
  })


function createResponse(status, message, data){
  return {
    status,
    message,
    data,
  };
};


export default userRouter;