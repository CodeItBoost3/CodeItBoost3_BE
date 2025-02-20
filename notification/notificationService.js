import eventBus from "../config/eventBus.js";
import { prisma } from "../app.js";
import { sendSSEMessageToUser } from "../config/sse.js";

export function registerNotificationHandler() {
  console.log("🟡 comment_created 이벤트 리스너 등록됨!");

  eventBus.on("comment_created", async ({ postId, commenterId, content }) => {
    console.log("✅ comment_created 이벤트 감지됨!", { postId, commenterId, content });

    try {
      const post = await prisma.post.findUnique({
        where: { postId },
        include: {
          author: { select: { id: true, nickname: true } }
        }
      });

      if (!post) {
        console.log(`⚠️ 게시글 ${postId}을 찾을 수 없음`);
        return;
      }

      const receiver = post.author.id;
      if (receiver === commenterId) {
        console.log("ℹ️ 본인이 작성한 글이므로 알림 전송 안 함.");
        return;
      }

      const message = await prisma.message.create({
        data: {
          type: 'COMMENT_CREATED',
          title: '📢 내 추억 글에 새로운 댓글이 달렸어요!',
          content,
          postId,
          notification: { create: { userId: receiver } }
        },
        include: { notification: true }
      });

      const { notification, commentId, ...filteredMessage } = message;
      filteredMessage.receiverName = post.author.nickname;
      sendSSEMessageToUser(receiver, filteredMessage);
      console.log(`🔔 ${receiver}번 유저에게 알림 전송`);
    } catch (error) {
      console.error("❌ 알림 생성 실패:", error);
    }
  });

  eventBus.on("reply_created", async ({ postId, parentId,commenterId, content }) => {
    console.log("✅ reply_created 이벤트 감지됨!", { postId, parentId, commenterId, content });

    try {
      const comment = await prisma.comment.findUnique({
        where: { commentId: parentId },
        include: {
          user: { select: { id: true, nickname: true } }
        }
      });
      if (!comment) {
        console.log(`⚠️ 댓글 ${parentId}을 찾을 수 없음`);
        return;
      }
      const post = await prisma.post.findUnique({
        where: { postId },
      });

      if (!post) {
        console.log(`⚠️ 게시글 ${postId}을 찾을 수 없음`);
        return;
      }

      const receiver = comment.user.id;
      if (receiver === commenterId) {
        console.log("ℹ️ 본인이 작성한 댓글이므로 알림 전송 안 함.");
        return;
      }

      const message = await prisma.message.create({
        data: {
          type: 'REPLY_CREATED',
          title: '📢 내 댓글에 새로운 답글이 달렸어요!',
          content,
          postId,
          notification: { create: { userId: receiver } }
        },
        include: { notification: true }
      });

      const { notification, commentId, ...filteredMessage } = message;
      filteredMessage.receiverName = comment.user.nickname;
      sendSSEMessageToUser(receiver, filteredMessage);
      console.log(`🔔 ${receiver}번 유저에게 알림 전송`);
    } catch (error) {
      console.error("❌ 알림 생성 실패:", error);
    }
  });
}
