import express from "express";
import { prisma } from "../../app.js";


const router = express.Router();

function createResponse(status, message, data) {
    return {
      status,
      message,
      data,
    };
  }

// 스크랩 목록 조회 API (좋아요순, 댓글순, 최신순, 키워드 검색 추가)
router.get("/scraps", async (req, res, next) => {
    try {
      const { page = 1, pageSize = 10, sortBy = "latest", isPublic, keyword } = req.query;
      const userId = req.user?.id; // 로그인한 사용자

      // 로그인 여부 
      if (!userId) {
        return res.status(401).json(createResponse("fail", "로그인이 필요합니다.", {}));
      }
  
      const take = parseInt(pageSize);
      const skip = (parseInt(page) - 1) * take;
  
      // 문자열 "true" / "false" 변환 (Boolean 필터 적용)
      let isPublicFilter;
      if (isPublic !== undefined) {
        isPublicFilter = isPublic === "true"; // "true" → true, "false" → false
      }
  
      // 스크랩 조회 쿼리
      const whereClause = {
        userId: parseInt(userId),
      };
  
      if (isPublicFilter !== undefined) {
        whereClause.isPublic = isPublicFilter; 
      }
  
      // 키워드 검색 기능 추가 (제목, 내용, 태그에서 검색)
      if (keyword) {
        whereClause.post = {
          OR: [
            { title: { contains: keyword } }, // 제목에서 검색
            { content: { contains: keyword } }, // 내용에서 검색
            { tag: { array_contains: keyword } }, // 태그에서 검색
          ],
        };
      }
  
      // 정렬 옵션 추가 (좋아요순, 댓글순, 최신순)
      let orderBy = { createdAt: "desc" }; // 기본값: 최신순
      if (sortBy === "mostLiked") {
        orderBy = { post: { likeCount: "desc" } }; // 스크랩한 게시물의 좋아요순
      } else if (sortBy === "mostCommented") {
        orderBy = { post: { commentCount: "desc" } }; // 댓글 많은 순
      }
  
      // 스크랩한 게시물 목록 조회 (스크랩한 게시물의 정보도 포함)
      const scraps = await prisma.scrap.findMany({
        where: whereClause,
        orderBy,
        skip,
        take,
        include: {
          post: true, 
        },
      });
  
      const totalItemCount = await prisma.scrap.count({ where: whereClause });
      const totalPages = Math.ceil(totalItemCount / take);
  
      return res.status(200).json(
        createResponse("success", "스크랩 목록 조회 성공", {
          currentPage: parseInt(page),
          totalPages,
          totalItemCount,
          data: scraps,
        })
      );
    } catch (error) {
      console.error(error);
      next(error);
    }
  });
  
  

// 스크랩 여부 확인
router.get("/scraps/:postId", async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(createResponse("fail", "로그인이 필요합니다.", {}));
    }

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }

    const scrap = await prisma.scrap.findUnique({
      where: { userId_postId: { userId, postId: parseInt(postId) } },
    });

    return res.status(200).json(createResponse("success", "스크랩 여부 확인 성공", { isScrapped: !!scrap }));
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//  스크랩한 게시물 상세 조회 API
router.get("/scraps/post/:postId", async (req, res, next) => {
    try {
      const { postId } = req.params;
      const userId = req.user?.id;
  
      if (!postId || isNaN(parseInt(postId))) {
        return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
      }
  
      //  사용자가 스크랩한 게시물인지 확인
      const scrap = await prisma.scrap.findFirst({
        where: {
          userId: parseInt(userId),
          postId: parseInt(postId),
        },
        include: {
          post: true,
        },
      });
  
      if (!scrap) {
        return res.status(404).json(createResponse("fail", "스크랩한 게시물이 아닙니다.", {}));
      }
  
      return res.status(200).json(createResponse("success", "스크랩한 게시물 상세 조회 성공", scrap.post));
    } catch (error) {
      console.error(error);
      next(error);
    }
  })


export default router;