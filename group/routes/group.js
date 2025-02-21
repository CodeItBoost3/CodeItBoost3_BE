import express from "express";
import bcrypt from 'bcrypt';
import { prisma } from "../../app.js";
import { CreateGroupStruct, UpdateGroupStruct } from "../groupStructs.js";
import { assert } from "superstruct";
import { upload } from '../../config/multer.js';
import { deleteFromS3, uploadToS3 } from '../../config/s3.js';
import { calculateDday, updateBadgesForGroup } from "../utils/groupUtils.js";

const groupRouter = express.Router();

// 1. 그룹 생성
groupRouter.post("/", upload.single("groupImage"), async (req, res, next) => {
  try {
    let jsonData = req.body.data ? JSON.parse(req.body.data) : {};
    const { name, introduction, password, isPublic: isPublicStr } = jsonData;
    const isPublic = jsonData.isPublic === "true" || jsonData.isPublic === true || jsonData.isPublic === undefined;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ status: "unauthorized", message: "로그인이 필요합니다." });
    }

    if (!isPublic && (!password || password.length < 6 || password.length > 16)) {
      return res.status(400).json({ status: "fail", message: "6~16자 사이의 비밀번호를 입력하세요." });
    }

    assert({ name, isPublic, introduction, userId, password }, CreateGroupStruct);

    const existingGroup = await prisma.group.findUnique({
      where: { groupName: name },
    });

    if (existingGroup) {
      return res.status(400).json(createResponse("fail", "이미 존재하는 그룹 이름입니다.", {}));
    }

    let imageUrl = null;

    if (req.file) {
      const safeFileName = Buffer.from(req.file.originalname, "utf8").toString("hex");
      const fileKey = `group_images/${Date.now()}-${safeFileName}`;
      await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
      imageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;
    }

    const hashedPassword = isPublic ? null : await bcrypt.hash(password, 10);

    const group = await prisma.group.create({
      data: {
        groupName: name,
        groupPassword: hashedPassword,
        isPublic,
        groupDescription: introduction,
        imageUrl,
        members: {
          create: {
            userId: userId,
            role: "ADMIN",
          },
        },
      },
      include: {
        members: true,
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
groupRouter.get("/:groupId", async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({
      where: { groupId: parseInt(req.params.groupId) },
      include: {
        members: true,
        posts: true,
        badges: {
          select: {
            badgeType: true,
            badgeName: true,
          },
        },
      }
    });

    if (!group) {
      return res.status(404).json({ status: "not_found", message: "존재하지 않는 그룹입니다." });
    }

    const totalLikeCount = group.groupLikeCount + group.posts.reduce((sum, post) => sum + post.likeCount, 0);

    const highestBadges = {
      LIKE: null,
      MEMBER: null,
      MEMORY: null,
    };

    for (const badge of group.badges) {
      if (badge.badgeType.startsWith("LIKE_")) highestBadges.LIKE = badge;
      if (badge.badgeType.startsWith("MEMBER_")) highestBadges.MEMBER = badge;
      if (badge.badgeType.startsWith("MEMORY_")) highestBadges.MEMORY = badge;
    }

    res.status(200).json({
      status: "success",
      message: "그룹 상세 조회 성공",
      data: {
        ...group,
        dday: calculateDday(group.createdAt),
        memberCount: group.members.length,
        postCount: group.posts.length,
        totalLikeCount, // 편리한 구별을 위해 likeCount에서 totalLikeCount로 필드명을 변경했습니다! 그룹 자체 공감은 groupLikeCount입니다.
        publicPosts: group.posts.filter(post => post.isPublic),
        privatePosts: group.posts.filter(post => !post.isPublic),
        badges: Object.values(highestBadges).filter(Boolean),
      },
    });
  } catch (error) {
    next(error);
  }
});

// 4. 그룹 목록 조회
groupRouter.get("/", async (req, res, next) => {
  try {
    const { type, sortBy = "mostLiked", keyword, page = 1 } = req.query;

    const pageNumber = Math.max(1, parseInt(page));

    const isPublicFilter = type === "public";
    const pageSize = type === "public" ? 8 : 20;

    const groupNameFilter = keyword ? { contains: keyword.toLowerCase() } : undefined;

    let orderBy = [{ posts: { _count: "desc" } }]; // 기본값: 좋아요순
    if (sortBy === "latest") orderBy = [{ createdAt: "desc" }];
    if (sortBy === "mostPosted") orderBy = [{ posts: { _count: "desc" } }];
    if (sortBy === "mostBadge") orderBy = [{ badgeCount: "desc" }];

    const totalGroups = await prisma.group.count({
      where: {
        groupName: groupNameFilter, isPublic: isPublicFilter,
      },
    });

    const totalPage = Math.ceil(totalGroups / pageSize);

    const groups = await prisma.group.findMany({
      where: { groupName: groupNameFilter, isPublic: isPublicFilter },
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
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    const formattedGroups = groups.map(group => ({
      groupId: group.groupId,
      groupName: group.groupName,
      isPublic: group.isPublic,
      dday: calculateDday(group.createdAt),
      postCount: group.posts.length,
      likeCount: group.posts.reduce((sum, post) => sum + post.likeCount, 0),
      imageUrl: group.isPublic ? group.imageUrl : null,
      badgeCount: group.badgeCount,
    }));

    if (sortBy === "mostLiked") {
      formattedGroups.sort((a, b) => b.likeCount - a.likeCount);
    }

    res.status(200).json(createResponse("success", "그룹 목록 조회 성공", {
      currentPage: pageNumber,
      totalPage,
      pageSize,
      totalGroups,
      groups: formattedGroups,
    }
    ));
  } catch (error) {
    next(error);
  }
});

// 5. 그룹 수정
groupRouter.patch("/:groupId", upload.single("groupImage"), async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    const userId = req.user.id;

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    });

    if (!userId) {
      return res.status(401).json(createResponse("unauthorized", "유저 정보가 없습니다. 로그인 후 이용해주세요.", {}));
    }

    if (!membership || membership.role !== "ADMIN") {
      return res.status(403).json(createResponse("forbidden", "관리자만 그룹을 수정할 수 있습니다.", {}));
    }

    let jsonData;
    if (req.body.data) {
      jsonData = JSON.parse(req.body.data);
    }

    let updateData = {};
    if (jsonData?.name !== undefined) updateData.groupName = jsonData.name;
    if (jsonData?.isPublic !== undefined) updateData.isPublic = jsonData.isPublic === "true" || jsonData.isPublic === true;
    if (jsonData?.introduction !== undefined) updateData.groupDescription = jsonData.introduction;

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
    const userId = req.user.id;

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
groupRouter.post("/:groupId/join", async (req, res, next) => {
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

    await updateBadgesForGroup(prisma, parseInt(groupId));

    res.status(201).json(createResponse("success", "그룹에 가입되었습니다.", newMembership));
  } catch (error) {
    next(error);
  }
});

// 11. 그룹 탈퇴
groupRouter.delete("/:groupId/leave", async (req, res, next) => {
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
        return res.status(400).json(createResponse("bad_request", "관리자는 탈퇴할 수 없습니다.", {}));
      }
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    res.status(200).json(createResponse("success", "그룹을 탈퇴하였습니다.", {}));
  } catch (error) {
    next(error);
  }
});

// 12. 그룹 자체 공감
groupRouter.post("/:groupId/like", async (req, res, next) => {

  try {
    const userId = req.user?.id;
    const groupId = Number(req.params.groupId);

    if (!userId) {
      return res.status(401).json({ status: "unauthorized", message: "로그인이 필요합니다." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupLike.create({
        data: { userId, groupId },
      });

      await tx.group.update({
        where: { groupId },
        data: { groupLikeCount: { increment: 1 } },
      });
    });

    await updateBadgesForGroup(prisma, parseInt(groupId));

    res.status(201).json({ status: "success", message: "그룹에 공감하였습니다." });
  } catch (error) {
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
