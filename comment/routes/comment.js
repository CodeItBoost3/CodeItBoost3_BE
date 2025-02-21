import express from "express";
import { prisma } from "../../app.js";
import jwt from "jsonwebtoken"; // JWT 검증을 위해 추가
import { Prisma } from "@prisma/client"; // Prisma 오류 처리를 위해 추가
import eventBus from "../../config/eventBus.js";

const commentRouter = express.Router();

function createResponse(status, message, data) {
  return {
    status,
    message,
    data,
  };
}

// 인증 미들웨어 추가
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res
      .status(401)
      .json(createResponse("fail", "인증 토큰이 필요합니다.", {}));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json(createResponse("fail", "토큰이 만료되었습니다.", {}));
    }
    return res
      .status(401)
      .json(createResponse("fail", "유효하지 않은 토큰입니다.", {}));
  }
};

// 입력 검증 미들웨어 추가
const validateCommentInput = (req, res, next) => {
  const { content } = req.body;

  // 내용 길이 검증 예시
  if (!content || content.trim().length === 0) {
    return res
      .status(400)
      .json(createResponse("fail", "댓글 내용이 비어있습니다.", {}));
  }

  if (content.length > 500) {
    // 예시: 최대 길이 제한
    return res
      .status(400)
      .json(createResponse("fail", "댓글은 500자를 초과할 수 없습니다.", {}));
  }

  next();
};

// 댓글과 대댓글 등록
commentRouter.post(
  "/posts/:postId/comments",
  authenticateToken,
  validateCommentInput,
  async (req, res) => {
    try {
      const { content, parentId } = req.body;
      const { postId } = req.params;
      const userId = req.user.id;

      // 디버깅을 위한 로그 추가
      console.log("Request body:", req.body);
      console.log("PostId:", postId);
      console.log("UserId:", userId);

      // 게시물 존재 확인 추가
      const post = await prisma.post.findUnique({
        where: { postId: parseInt(postId) },
      });

      if (!post) {
        return res
          .status(404)
          .json(createResponse("fail", "해당 게시물을 찾을 수 없습니다.", {}));
      }

      // 사용자 존재 확인
      const user = await prisma.user.findUnique({
        where: { id: parseInt(userId) },
        select: {
          id: true,
          nickname: true,
          profileImageUrl: true,
        },
      });

      if (!user) {
        return res
          .status(404)
          .json(createResponse("fail", "사용자를 찾을 수 없습니다.", {}));
      }

      // 대댓글인 경우 부모 댓글 존재 확인
      if (parentId) {
        const parentComment = await prisma.comment.findUnique({
          where: { commentId: parseInt(parentId) },
        });

        if (!parentComment) {
          return res
            .status(404)
            .json(createResponse("fail", "부모 댓글을 찾을 수 없습니다.", {}));
        }
      }

      // 댓글 생성
      const comment = await prisma.comment.create({
        data: {
          content: content.trim(),
          userId: parseInt(userId),
          postId: parseInt(postId),
          parentId: parentId ? parseInt(parentId) : null,
          nickname: user.nickname,
        },
        include: {
          author: {
            select: {
              nickname: true,
              profileImageUrl: true,
            },
          },
        },
      });

      // 댓글/대댓글 작성
      if (parentId) {
        eventBus.emit("reply_created", {
          postId: parseInt(postId),
          parentId,
          commenterId: userId,
          content: comment.content,
        });
      } else {
        eventBus.emit("comment_created", {
          postId: parseInt(postId),
          commenterId: userId,
          content: comment.content,
        });
      }

      res
        .status(201)
        .json(createResponse("success", "댓글이 등록되었습니다.", comment));
    } catch (error) {
      // Prisma 특정 에러 처리
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error("Prisma 데이터베이스 오류:", error);
        return res.status(400).json(
          createResponse("fail", "데이터베이스 오류가 발생했습니다.", {
            errorCode: error.code,
            errorMessage: error.message,
          })
        );
      }

      // 기타 예상치 못한 오류
      console.error("댓글 등록 상세 오류:", error);
      console.error("에러 이름:", error.name);
      console.error("에러 메시지:", error.message);
      console.error("에러 스택:", error.stack);

      res.status(500).json(
        createResponse("error", "서버 오류가 발생했습니다.", {
          errorName: error.name,
          errorMessage: error.message,
        })
      );
    }
  }
);

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
            author: {
              select: {
                nickname: true,
                profileImageUrl: true,
              },
            },
          },
        },
        likes: true,
        author: {
          select: {
            nickname: true,
            profileImageUrl: true,
          },
        },
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
commentRouter.put(
  "/comments/:commentId",
  authenticateToken,
  validateCommentInput,
  async (req, res) => {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      // 필수 입력값 검증
      if (!content) {
        return res
          .status(400)
          .json(createResponse("fail", "수정할 내용을 입력해주세요.", {}));
      }

      // 댓글 존재 및 권한 확인
      const existingComment = await prisma.comment.findFirst({
        where: {
          commentId: parseInt(commentId),
          userId: parseInt(userId),
        },
      });

      if (!existingComment) {
        return res
          .status(404)
          .json(
            createResponse(
              "fail",
              "댓글을 찾을 수 없거나 수정 권한이 없습니다.",
              {}
            )
          );
      }

      // 댓글 수정
      const updatedComment = await prisma.comment.update({
        where: {
          commentId: parseInt(commentId),
        },
        data: {
          content,
        },
        include: {
          author: {
            select: {
              nickname: true,
              profileImageUrl: true,
            },
          },
        },
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
  }
);

// 댓글 삭제
commentRouter.delete("/comments/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

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
    const userId = req.user.id;

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
