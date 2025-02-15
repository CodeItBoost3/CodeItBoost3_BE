import express from "express";
import { prisma } from "../../app.js";
import { assert } from "superstruct";
import { createPost } from "../postStructs.js";
import { upload } from "../../config/multer.js";
import { deleteFromS3, uploadToS3 } from "../../config/s3.js";



const router = express.Router();

//  공통 응답 함수
function createResponse(status, message, data) {
  return {
    status,
    message,
    data,
  };
}

// 📌 게시물 등록 API (이미지 없이도 테스트 가능하게 수정)
//  게시물 등록 API 
router.post("/:groupId/posts", upload.single("image"), async (req, res, next) => {
  try {
    console.log(req.body);

    // 요청 데이터 검증
    assert(req.body, createPost);

    const { groupId } = req.params; 
    const { title, content, tag, location, moment, isPublic } = req.body;
    const clientId = req.user?.id;

    if (!groupId || isNaN(groupId)) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }
    
    if (!req.file) {
      return res.status(400).json(createResponse("fail", "이미지를 업로드해주세요.", {}));
    }
    

     // S3 업로드 처리
     const path = "post_images";
     const fileKey = `${path}/${Date.now()}-${req.file.originalname}`;
     await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
     const imageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;

    // clientId 검증: DB에서 사용자가 존재하는지 확인
    let user = await prisma.user.findUnique({
      where: { id : userId },  
      select: { id: true, nickname: true },
    });

    if (!user) {
      return res.status(400).json(createResponse("fail", "유효하지 않은 사용자입니다.", {}));
    }
    

    // 존재하는 유저라면 게시물 등록
    const newPost = await prisma.post.create({
      data: {
        groupId: parseInt(groupId),
        nickname: user.nickname,
        title,
        content,
        imageUrl,
        location,
        moment: new Date(moment),
        isPublic,
        likeCount: 0,
        commentCount: 0,
        tag,
        createdAt: new Date(),
	      user: {
          connect: { id: user.id }
        },
      },
    });

    res.status(201).json(createResponse("success", "게시글이 등록되었습니다.", newPost));
  } catch (error) {
    console.error(error);
    next(error);
  }
});


//  게시물 목록 조회 API
router.get("/:groupId/posts", async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const { page = 1, pageSize = 10, sortBy = "latest", keyword, isPublic } = req.query;

    if (!groupId || isNaN(groupId)) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }

    const take = parseInt(pageSize);
    const skip = (parseInt(page) - 1) * take;

    let orderBy = { createdAt: "desc" };
    if (sortBy === "mostCommented") {
      orderBy = { commentCount: "desc" };
    } else if (sortBy === "mostLiked") {
      orderBy = { likeCount: "desc" };
    } 

    const whereClause = { groupId: parseInt(groupId) };

    if (keyword) {
      whereClause.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
        { tag: { array_contains: keyword } },
      ];
    }

    if (isPublic !== undefined) {
      whereClause.isPublic = isPublic === "true";
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      orderBy,
      skip,
      take,
    });

    const totalItemCount = await prisma.post.count({ where: whereClause });
    const totalPages = Math.ceil(totalItemCount / take);

    res.status(200).json(
      createResponse("success", "게시물 목록 조회 성공", {
        currentPage: parseInt(page),
        totalPages,
        totalItemCount,
        data: posts,
      })
    );
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//  게시물 상세 조회 API
router.get("/:postId", async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }

    //  게시물 조회
    const post = await prisma.post.findUnique({
      where: { postId: parseInt(postId) },
      select: {
        postId: true,
        groupId: true,
        nickname: true,
        title: true,
        content: true,
        imageUrl: true,
        tag: true, 
        location: true,
        moment: true,
        isPublic: true,
        likeCount: true,
        commentCount: true,
        createdAt: true,
      },
    });

    // 게시물이 존재하지 않으면 404 반환
    if (!post) {
      return res.status(404).json(createResponse("fail", "해당 게시글을 찾을 수 없습니다.", {}));
    }

    // 응답 반환
    return res.status(200).json(createResponse("success", "게시글 조회 성공", post));
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//  게시물 수정 API (로그인한 사용자만 수정 가능)
router.put("/:postId", upload.single("image"), async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { title, content, tag, location, moment, isPublic } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(createResponse("fail", "로그인이 필요합니다.", {}));
    }

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }

    // 게시물 존재 여부 확인
    const existingPost = await prisma.post.findUnique({
      where: { postId: parseInt(postId) },
      select: { userId: true, imageUrl: true },
    });

    if (!existingPost) {
      return res.status(404).json(createResponse("fail", "존재하지 않는 게시글입니다.", {}));
    }

    // 본인 확인 (작성자가 아니면 수정 불가)
    if (existingPost.userId !== userId) {
      return res.status(403).json(createResponse("fail", "작성자만 수정할 수 있습니다.", {}));
    }

    let updatedImageUrl = existingPost.imageUrl;

    // 새로운 이미지 업로드 시 기존 이미지 삭제 후 새 이미지 업로드
    if (req.file) {
      if (existingPost.imageUrl) {
        await deleteFromS3(existingPost.imageUrl.replace(process.env.AWS_CLOUD_FRONT_URL + "/", ""));
      }

      const path = "post_images";
      const fileKey = `${path}/${Date.now()}-${req.file.originalname}`;
      await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
      updatedImageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;
    }

    // 게시물 업데이트
    const updatedPost = await prisma.post.update({
      where: { postId: parseInt(postId) },
      data: {
        title,
        content,
        imageUrl: updatedImageUrl,
        location,
        moment: new Date(moment),
        isPublic,
        tag,
      },
    });

    return res.status(200).json(createResponse("success", "게시글이 수정되었습니다.", updatedPost));
  } catch (error) {
    console.error(error);
    next(error);
  }
});

//  게시물 삭제 API (로그인한 사용자만 삭제 가능)
router.delete("/:postId", async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({ status: "fail", message: "로그인이 필요합니다.", data: {} });
    }

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json({ status: "fail", message: "잘못된 요청입니다.", data: {} });
    }

    // 게시물 존재 여부 확인
    const existingPost = await prisma.post.findUnique({
      wwhere: { postId: parseInt(postId) },
      select: { userId: true, imageUrl: true },
    });

    if (!existingPost) {
      return res.status(404).json({ status: "fail", message: "존재하지 않는 게시글입니다.", data: {} });
    }

    // 본인 확인 (작성자가 아니면 삭제 불가)
    if (existingPost.userId !== userId) {
      return res.status(403).json({ status: "fail", message: "작성자만 삭제할 수 있습니다.", data: {} });
    }

    // S3에서 이미지 삭제
    if (existingPost.imageUrl) {
      await deleteFromS3(existingPost.imageUrl.replace(process.env.AWS_CLOUD_FRONT_URL + "/", ""));
    }

    // 게시물 삭제
    await prisma.post.delete({
      where: { postId: parseInt(postId) },  
    });

    return res.status(200).json({ status: "success", message: "게시글 삭제 성공" });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 게시글 공감 누르기 (좋아요)
router.post("/:postId/like", async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json({ status: "fail", message: "잘못된 요청입니다." });
    }

    // 게시물 존재 여부 확인
    const existingPost = await prisma.post.findUnique({
      where: { postId: parseInt(postId) },
    });

    if (!existingPost) {
      return res.status(404).json({ status: "fail", message: "존재하지 않는 게시글입니다." });
    }

    // 공감(좋아요) 수 증가
    await prisma.post.update({
      where: { postId: parseInt(postId) },
      data: {
        likeCount: { increment: 1 },  
      },
    });

    return res.status(200).json({ status: "success", message: "게시글 공감하기 성공" });
  } catch (error) {
    console.error(error);
    next(error);
  }
});



//  게시물 공개 여부 확인 API
router.get("/:postId/is-public", async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json({ status: "fail", message: "잘못된 요청입니다." });
    }

    // 게시물 존재 여부 확인
    const existingPost = await prisma.post.findUnique({
      where: { postId: parseInt(postId) },
      select: { postId: true, isPublic: true },
    });

    if (!existingPost) {
      return res.status(404).json({ status: "fail", message: "존재하지 않는 게시글입니다." });
    }

    return res.status(200).json({
      id: existingPost.postId,
      isPublic: existingPost.isPublic,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 스크랩 추가/삭제 (공개 여부 포함)
router.post("/:postId/scrap", async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.id || 1;
    let { isPublic = true } = req.body; 

    
    if (typeof isPublic === "string") {
      isPublic = isPublic === "true";  // "false"면 false, "true"면 true
    }

    if (!postId || isNaN(parseInt(postId))) {
      return res.status(400).json(createResponse("fail", "잘못된 요청입니다.", {}));
    }

    // 존재하는 게시물인지 확인
    const postExists = await prisma.post.findUnique({
      where: { postId: parseInt(postId) },
    });

    if (!postExists) {
      return res.status(404).json(createResponse("fail", "존재하지 않는 게시물입니다.", {}));
    }

    // 기존 스크랩 여부 확인
    const existingScrap = await prisma.scrap.findFirst({
      where: {
        userId: parseInt(userId),
        postId: parseInt(postId),
      },
    });

    if (existingScrap) {
      //  이미 스크랩한 상태 -> 스크랩 취소 (삭제)
      await prisma.scrap.delete({
        where: {
          userId_postId: {
            userId: parseInt(userId),
            postId: parseInt(postId),
          },
        },
      });

      return res.status(200).json(createResponse("success", "스크랩이 취소되었습니다.", {}));
    }

    // 스크랩 추가 (공개 여부 포함)
    const newScrap = await prisma.scrap.create({
      data: {
        userId: parseInt(userId),
        postId: parseInt(postId),
        isPublic: isPublic,  
      },
    });

    return res.status(201).json(createResponse("success", "스크랩이 완료되었습니다.", newScrap));
  } catch (error) {
    console.error(error);
    next(error);
  }
});





export default router;
