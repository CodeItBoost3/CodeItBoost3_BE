import express from 'express';
import { wrapAsync } from '../app.js';

export const sseRouter = express.Router();
const clients = new Map(); // SSE 연결된 클라이언트 저장

// 클라이언트가 SSE 스트림을 구독하는 엔드포인트
sseRouter.get('/subscribe', wrapAsync( (req, res) => {
  const userId = req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 등록되지 않은 유저이면 클라이언트로 유저 등록 
  if (!clients.has(userId)) { 
    clients.set(userId, []);
  }
  clients.get(userId).push(res);

  console.log(`📡 Client connected for user ${userId}`);

  // 연결 종료 시 클라이언트 제거
  req.on('close', () => {
    clients.set(userId, clients.get(userId).filter(client => client !== res));
    if (clients.get(userId).length === 0) {
      clients.delete(userId);
    }
    console.log(`❌ Client disconnected for user ${userId}`);
  });
}));

// 특정 유저에게만 알림 전송
export const sendSSEMessageToUser = (userId, data) => {
  if (clients.has(userId)) {
      clients.get(userId).forEach(client => {
          client.write(`data: ${JSON.stringify(data)}\n\n`);
      });
      console.log(`🔔 Sent notification to user ${userId}`);
  } else {
      console.log(`⚠️ No active SSE connections for user ${userId}`);
  }
};