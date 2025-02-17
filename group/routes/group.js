import express from "express";
import bcrypt from 'bcrypt';
import { prisma } from "../../app.js";
import { CreateGroupStruct, UpdateGroupStruct } from "../groupStructs.js";
import { assert } from "superstruct";
import { upload } from '../../config/multer.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { deleteFromS3, uploadToS3 } from '../../config/s3.js';
import { authenticateByToken } from "../../auth/routes/authToken.js";
import { calculateDday } from "../utils/groupUtils.js";

const groupRouter = express.Router();

// 1. 그룹 생성
groupRouter.post("/", authenticateByToken, upload.single("groupImage"), async (req, res, next) => {
  try {
    const { name, introduction, password } = req.body;
    const userId = Number(req.body.userId);
    const isPublic = req.body.isPublic === "true";

    assert({ name, isPublic, introduction, userId, password }, CreateGroupStruct);

    const existingGroup = await prisma.group.findUnique({
      where: { groupName: name },
    });

    if (existingGroup) {
      return res.status(400).json(createResponse("fail", "이미 존재하는 그룹 이름입니다.", {}));
    }

    let fileKey = null;
    let imageUrl = null;

    if (req.file) {
      fileKey = `group_images/${Date.now()}-${req.file.originalname}`;
      await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
      imageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;
    }

    const group = await prisma.group.create({
      data: {
        groupName: name,
        groupPassword: await bcrypt.hash(password, 10),
        isPublic,
        groupDescription: introduction,
        imageUrl,
        members: {
          create: {
            user: { connect: { id: parseInt(userId) } },
            role: "ADMIN",
          },
        },
      },
    });

    res.status(201).json(createResponse("success", "그룹이 생성되었습니다.", { ...group, imageUrl }));
  } catch (error) {
    next(error);
  }
});

// 2. 그룹 이름 검색
groupRouter.get("/search", async (req, res, next) => {
  try {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ status: "fail", message: "검색어를 입력해주세요." });
    const groups = await prisma.group.findMany({ where: { groupName: { contains: keyword.toLowerCase() } }, include: { posts: true } });
    res.status(200).json({
      status: "success",
      message: "그룹 검색 성공",
      data: groups.map(group => ({
        ...group,
        dday: calculateDday(group.createdAt),
        postCount: group.posts.length,
        likeCount: group.posts.reduce((sum, post) => sum + post.likeCount, 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// 3. 그룹 상세 조회
groupRouter.get("/:groupId", authenticateByToken, async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({ where: { groupId: parseInt(req.params.groupId) }, include: { members: true, posts: true } });
    if (!group) return res.status(404).json({ status: "not_found", message: "존재하지 않는 그룹입니다." });
    res.status(200).json({
      status: "success",
      message: "그룹 상세 조회 성공",
      data: {
        ...group,
        dday: calculateDday(group.createdAt),
        memberCount: group.members.length,
        postCount: group.posts.length,
        likeCount: group.posts.reduce((sum, post) => sum + post.likeCount, 0),
        publicPosts: group.posts.filter(post => post.isPublic),
        privatePosts: group.posts.filter(post => !post.isPublic),
      },
    });
  } catch (error) {
    next(error);
  }
});

// 4. 그룹 목록 조회
groupRouter.get("/", async (req, res, next) => {
  try {
    const { type, sortBy = "mostLiked", keyword } = req.query;

    let isPublicFilter = type === "public" ? true : type === "private" ? false : null;

    let orderBy = { createdAt: "desc" };

    if (sortBy === "latest") orderBy = { createdAt: "desc" };
    else if (sortBy === "mostPosted") orderBy = { posts: { _count: "desc" } };
    else if (sortBy === "mostBadge") orderBy = { badgeCount: "desc" };

    const groups = await prisma.group.findMany({
      where: {
        groupName: keyword ? { contains: keyword.toLowerCase() } : undefined,
        isPublic: isPublicFilter,
      },
      select: {
        groupId: true,
        groupName: true,
        isPublic: true,
        createdAt: true,
        imageUrl: true,
        badgeCount: true,
        posts: {
          select: { postId: true, likeCount: true },
        },
      },
      orderBy,
    });

    let formattedGroups = groups.map(group => ({
      groupId: group.groupId,
      groupName: group.groupName,
      isPublic: group.isPublic,
      dday: calculateDday(group.createdAt),
      postCount: group.posts.length,
      likeCount: group.posts.reduce((sum, post) => sum + post.likeCount, 0),
      imageUrl: group.isPublic ? group.imageUrl : null,
    }));

    if (sortBy === "mostLiked") {
      formattedGroups.sort((a, b) => b.likeCount - a.likeCount);
    }

    res.status(200).json(createResponse("success", "그룹 목록 조회 성공", formattedGroups));
  } catch (error) {
    next(error);
  }
});

// 5. 그룹 수정
groupRouter.patch("/:groupId", upload.single("groupImage"), async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = Number(req.user.id);

    if (!userId) {
      return res.status(401).json(createResponse("unauthorized", "유저 정보가 없습니다. 로그인 후 이용해주세요.", {}));
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    });

    if (!membership || membership.role !== "ADMIN") {
      return res.status(403).json(createResponse("forbidden", "관리자만 그룹을 수정할 수 있습니다.", {}));
    }

    let updateData = {};
    if (req.body.name !== undefined) updateData.groupName = req.body.name;
    if (req.body.isPublic !== undefined) {
      updateData.isPublic = req.body.isPublic === "true" || req.body.isPublic === true;
    }
    if (req.body.introduction !== undefined) updateData.groupDescription = req.body.introduction;

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { imageUrl: true },
    });

    if (req.file) {
      const fileKey = `group_images/${Date.now()}-${req.file.originalname}`;

      await prisma.$transaction(async (tx) => {

        if (group.imageUrl) {
          await deleteFromS3(group.imageUrl);
        }

        await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
        updateData.imageUrl = fileKey;
      });
    }

    const updatedGroup = await prisma.group.update({
      where: { groupId },
      data: updateData,
    });

    res.status(200).json(
      createResponse("success", "그룹이 성공적으로 수정되었습니다.", {
        ...updatedGroup,
        imageUrl: `${process.env.AWS_CLOUD_FRONT_URL}/${updatedGroup.imageUrl}`,
      })
    );
  } catch (error) {
    next(error);
  }
});

// 6. 그룹 이미지 삭제 
groupRouter.delete("/:groupId/image", async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { imageUrl: true },
    });

    if (!group) {
      return res.status(404).json({ status: "not_found", message: "존재하지 않는 그룹입니다." });
    }

    if (!group.imageUrl) {
      return res.status(400).json({ status: "fail", message: "삭제할 이미지가 없습니다." });
    }

    await deleteFromS3(group.imageUrl);

    await prisma.group.update({
      where: { groupId },
      data: { imageUrl: null },
    });

    res.status(200).json({ status: "success", message: "그룹 대표 이미지가 삭제되었습니다." });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

// 7. 그룹 삭제
groupRouter.delete("/:groupId", async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(createResponse("unauthorized", "유저 정보가 없습니다. 로그인 후 이용해주세요.", {}));
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    });

    if (!membership || membership.role !== "ADMIN") {
      return res.status(403).json(createResponse("forbidden", "관리자만 그룹을 삭제할 수 있습니다.", {}));
    }

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { imageUrl: true },
    });

    if (!group) {
      return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
    }

    if (group.imageUrl) {
      await deleteFromS3(group.imageUrl);
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { groupId } });
      await tx.post.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { groupId } });
    });

    res.status(200).json(createResponse("success", "그룹이 성공적으로 삭제되었습니다.", {}));
  } catch (error) {
    console.error("🔥 그룹 삭제 오류:", error);
    next(error);
  }
});

// 8. 그룹 공개 여부 확인
groupRouter.get("/:groupId/is-public", async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({
      where: { groupId: Number(req.params.groupId) },
      select: { isPublic: true },
    });

    if (!group) {
      return res.status(404).json({ status: "not_found", message: "존재하지 않는 그룹입니다.", data: {} });
    }

    res.status(200).json({ status: "success", message: "그룹 공개 여부 조회 성공", data: group });
  } catch (error) {
    next(error);
  }
});

// 9. 비밀번호 검증
groupRouter.post("/:groupId/verify-password", async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const { password } = req.body;

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { groupPassword: true, isPublic: true },
    });

    if (!group) {
      return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
    }

    const isPasswordValid = await bcrypt.compare(password, group.groupPassword);
    if (!isPasswordValid) {
      return res.status(401).json(createResponse("unauthorized", "비밀번호가 일치하지 않습니다.", { verified: false }));
    }

    res.status(200).json(createResponse("success", "비밀번호가 확인되었습니다.", { verified: true }));
  } catch (error) {
    next(error);
  }
});

// 10. 그룹 가입
groupRouter.post("/:groupId/join", authenticateByToken, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json(createResponse("unauthorized", "로그인이 필요합니다.", {}));
    }

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { isPublic: true },
    });

    if (!group) {
      return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
    }

    const existingMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (existingMembership) {
      return res.status(400).json(createResponse("bad_request", "이미 가입한 그룹입니다.", {}));
    }

    const newMembership = await prisma.groupMember.create({
      data: {
        userId,
        groupId,
        role: "MEMBER",
      },
    });

    res.status(201).json(createResponse("success", "그룹에 가입되었습니다.", newMembership));
  } catch (error) {
    next(error);
  }
});

// 11. 그룹 탈퇴
groupRouter.delete("/:groupId/leave", authenticateByToken, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json(createResponse("unauthorized", "로그인이 필요합니다.", {}));
    }

    const group = await prisma.group.findUnique({
      where: { groupId },
      select: { groupId: true },
    });

    if (!group) {
      return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      return res.status(400).json(createResponse("bad_request", "가입하지 않은 그룹입니다.", {}));
    }

    const isAdmin = membership.role === "ADMIN";

    if (isAdmin) {
      const adminCount = await prisma.groupMember.count({
        where: { groupId, role: "ADMIN" },
      });

      if (adminCount <= 1) {
        return res.status(400).json(createResponse("bad_request", "마지막 관리자는 탈퇴할 수 없습니다.", {}));
      }
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    res.status(200).json(createResponse("success", "그룹을 탈퇴하였습니다.", {}));
  } catch (error) {
    console.error(`❌ 그룹 탈퇴 중 오류 발생: ${error.message}`);
    next(error);
  }
});

function createResponse(status, message, data) {
  return {
    status,
    message,
    data,
  };
}

export default groupRouter;
