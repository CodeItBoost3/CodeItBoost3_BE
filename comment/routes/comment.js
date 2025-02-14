import express from "express";
import { prisma } from "../../app.js";

const commentRouter = express.Router();

function createResponse(status, message, data) {
  return {
    status,
    message,
    data,
  };
}

// 댓글과 대댓글 등록
commentRouter.post("/posts/:postId/comments", async (req, res) => {
  try {
    const { content, parentId, userId } = req.body;
    const { postId } = req.params;

    // 필수값 체크
    if (!content || !userId) {
      return res
        .status(400)
        .json(
          createResponse("fail", "댓글 내용과 사용자 정보가 필요합니다.", {})
        );
    }

    // 사용자 존재 확인
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res
        .status(404)
        .json(createResponse("fail", "사용자를 찾을 수 없습니다.", {}));
    }

    // 댓글 생성
    const comment = await prisma.comment.create({
      data: {
        content,
        userId: parseInt(userId),
        postId: parseInt(postId),
        parentId: parentId ? parseInt(parentId) : null,
        nickname: user.nickname,
      },
    });

    res
      .status(201)
      .json(createResponse("success", "댓글이 등록되었습니다.", comment));
  } catch (error) {
    console.error("댓글 등록 오류:", error);
    res
      .status(500)
      .json(createResponse("error", "서버 오류가 발생했습니다.", {}));
  }
});

// 댓글 목록 조회
commentRouter.get("/posts/:postId/comments", async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

    const comments = await prisma.comment.findMany({
      where: {
        postId: parseInt(postId),
        parentId: null,
      },
      include: {
        replies: {
          include: {
            likes: true,
          },
        },
        likes: true,
      },
      skip,
      take: parseInt(pageSize),
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(
      createResponse("success", "댓글 목록을 불러왔습니다.", {
        comments,
        currentPage: parseInt(page),
        pageSize: parseInt(pageSize),
      })
    );
  } catch (error) {
    console.error("댓글 조회 오류:", error);
    res
      .status(500)
      .json(createResponse("error", "댓글 조회 중 오류가 발생했습니다.", {}));
  }
});

// 댓글 수정
commentRouter.put("/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content, userId } = req.body; // userId를 body에서 받아옴

    const comment = await prisma.comment.findFirst({
      where: {
        commentId: parseInt(commentId),
        userId: parseInt(userId),
      },
    });

    if (!comment) {
      return res
        .status(404)
        .json(
          createResponse("fail", "댓글을 찾을 수 없거나 권한이 없습니다.", {})
        );
    }

    const updatedComment = await prisma.comment.update({
      where: {
        commentId: parseInt(commentId),
      },
      data: { content },
    });

    res.json(
      createResponse("success", "댓글이 수정되었습니다.", updatedComment)
    );
  } catch (error) {
    console.error("댓글 수정 오류:", error);
    res
      .status(500)
      .json(createResponse("error", "댓글 수정 중 오류가 발생했습니다.", {}));
  }
});

// 댓글 삭제
commentRouter.delete("/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId } = req.body; // userId를 body에서 받아옴

    const comment = await prisma.comment.findFirst({
      where: {
        commentId: parseInt(commentId),
        userId: parseInt(userId),
      },
    });

    if (!comment) {
      return res
        .status(404)
        .json(
          createResponse("fail", "댓글을 찾을 수 없거나 권한이 없습니다.", {})
        );
    }

    await prisma.$transaction([
      prisma.commentLike.deleteMany({
        where: {
          comment: {
            parentId: parseInt(commentId),
          },
        },
      }),
      prisma.comment.deleteMany({
        where: {
          parentId: parseInt(commentId),
        },
      }),
      prisma.commentLike.deleteMany({
        where: {
          commentId: parseInt(commentId),
        },
      }),
      prisma.comment.delete({
        where: {
          commentId: parseInt(commentId),
        },
      }),
    ]);

    res.json(createResponse("success", "댓글이 삭제되었습니다.", {}));
  } catch (error) {
    console.error("댓글 삭제 오류:", error);
    res
      .status(500)
      .json(createResponse("error", "댓글 삭제 중 오류가 발생했습니다.", {}));
  }
});

// 좋아요 토글
commentRouter.post("/comments/:commentId/like", async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId } = req.body; // userId를 body에서 받아옴

    const existingLike = await prisma.commentLike.findFirst({
      where: {
        commentId: parseInt(commentId),
        userId: parseInt(userId),
      },
    });

    if (existingLike) {
      await prisma.commentLike.delete({
        where: {
          id: existingLike.id,
        },
      });
    } else {
      await prisma.commentLike.create({
        data: {
          userId: parseInt(userId),
          commentId: parseInt(commentId),
        },
      });
    }

    const likeCount = await prisma.commentLike.count({
      where: {
        commentId: parseInt(commentId),
      },
    });

    res.json(
      createResponse(
        "success",
        existingLike ? "좋아요가 취소되었습니다." : "좋아요가 추가되었습니다.",
        { liked: !existingLike, likeCount }
      )
    );
  } catch (error) {
    console.error("좋아요 처리 오류:", error);
    res
      .status(500)
      .json(createResponse("error", "좋아요 처리 중 오류가 발생했습니다.", {}));
  }
});

export default commentRouter;
