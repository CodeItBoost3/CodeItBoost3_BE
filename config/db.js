import { prisma } from "../app.js";

export async function checkDBConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database 연결 성공');
  } catch (error) {
    console.error('❌ Database 연결 실패:', error);
  } finally {
    await prisma.$disconnect();
  }
}