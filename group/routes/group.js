import express from "express";
import { prisma } from "../../app.js";
import { CreateGroupStruct, UpdateGroupStruct } from "../groupStructs.js";
import { assert } from "superstruct";
import { upload } from '../../config/multer.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { deleteFromS3, uploadToS3 } from '../../config/s3.js';

const groupRouter = express.Router();

// 1. 그룹 생성
groupRouter.post("/", upload.single("groupImage"), async (req, res, next) => {
    try {
        assert(req.body, CreateGroupStruct);
        const { name, password, isPublic, introduction, userId } = req.body;

        let imageUrl = null;
        if (req.file) {
            const fileKey = `group_images/${Date.now()}-${req.file.originalname}`;
            await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
            imageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;
        }

        const group = await prisma.group.create({
            data: {
                groupName: name,
                groupPassword: password,
                isPublic,
                groupDescription: introduction,
                imageUrl,
                members: {
                    create: {
                        user: { connect: { id: userId } },
                        role: "ADMIN",
                    },
                },
            },
        });

        res.status(201).json(createResponse("success", "그룹이 생성되었습니다.", group));
    } catch (error) {
        next(error);
    }
});

// 2. 그룹 이름 검색
groupRouter.get("/search", async (req, res, next) => {
    try {
        const { keyword } = req.query;

        const groups = await prisma.group.findMany({
            where: {
                groupName: keyword ? { contains: keyword.toLowerCase() } : undefined,
            },
        });

        res.status(200).json(createResponse("success", "그룹 검색 성공", groups));
    } catch (error) {
        next(error);
    }
});

// 3. 그룹 상세 조회
groupRouter.get("/:groupId", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);

        const group = await prisma.group.findUnique({
            where: { groupId },
        });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        res.status(200).json(createResponse("success", "그룹 상세 조회 성공", group));
    } catch (error) {
        next(error);
    }
});

// 4. 그룹 목록 조회
groupRouter.get("/", async (req, res, next) => {
    try {
        const { sortBy, keyword, isPublic } = req.query;

        let orderBy = { createdAt: "desc" };
        switch (sortBy) {
            case "latest":
                orderBy = { createdAt: "desc" };
                break;
            case "mostPosted":
                orderBy = { postCount: "desc" };
                break;
            case "mostLiked":
                orderBy = { likeCount: "desc" };
                break;
            case "mostBadge":
                orderBy = { badgeCount: "desc" };
                break;
        }

        const groups = await prisma.group.findMany({
            where: {
                groupName: keyword ? { contains: keyword.toLowerCase() } : undefined,
                isPublic: isPublic === "true" ? true : isPublic === "false" ? false : undefined,
            },
            orderBy,
        });

        res.status(200).json(createResponse("success", "그룹 목록 조회 성공", groups));
    } catch (error) {
        next(error);
    }
});

// 5. 그룹 수정
groupRouter.patch("/:groupId", upload.single("groupImage"), async (req, res, next) => {
    try {
        assert(req.body, UpdateGroupStruct);
        const groupId = parseInt(req.params.groupId);

        const existingGroup = await prisma.group.findUnique({
            where: { groupId },
            select: { imageUrl: true },
        });

        if (!existingGroup) {
            return res.status(404).json(createResponse("not_found", "그룹을 찾을 수 없습니다."));
        }

        let imageUrl = existingGroup.imageUrl;
        if (req.file) {
            const fileKey = `group_images/${Date.now()}-${req.file.originalname}`;

            await prisma.$transaction(async (tx) => {
                if (existingGroup.imageUrl) {
                    await deleteFromS3(existingGroup.imageUrl.replace(`${process.env.AWS_CLOUD_FRONT_URL}/`, ""));
                }

                await uploadToS3(fileKey, req.file.buffer, req.file.mimetype);
                imageUrl = `${process.env.AWS_CLOUD_FRONT_URL}/${fileKey}`;

                await tx.group.update({
                    where: { groupId },
                    data: {
                        groupName: req.body.name,
                        groupPassword: req.body.password,
                        isPublic: req.body.isPublic,
                        groupDescription: req.body.introduction,
                        imageUrl,
                    },
                });
            });
        } else {
            // 이미지 업로드 없이 다른 정보만 수정
            await prisma.group.update({
                where: { groupId },
                data: {
                    groupName: req.body.name,
                    groupPassword: req.body.password,
                    isPublic: req.body.isPublic,
                    groupDescription: req.body.introduction,
                },
            });
        }

        res.status(200).json(createResponse("success", "그룹이 성공적으로 수정되었습니다."));
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

        if (!group || !group.imageUrl) {
            return res.status(404).json(createResponse("not_found", "이미지가 존재하지 않습니다."));
        }

        await deleteFromS3(group.imageUrl.replace(`${process.env.AWS_CLOUD_FRONT_URL}/`, ""));
        await prisma.group.update({
            where: { groupId },
            data: { imageUrl: null },
        });

        res.status(200).json(createResponse("success", "그룹 이미지가 삭제되었습니다."));
    } catch (error) {
        next(error);
    }
});

// 7. 그룹 삭제
groupRouter.delete("/:groupId", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);

        const group = await prisma.group.findUnique({ where: { groupId } });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        await prisma.groupMember.deleteMany({ where: { groupId } });
        await prisma.group.delete({ where: { groupId } });

        res.status(200).json(createResponse("success", "그룹이 삭제되었습니다.", {}));
    } catch (error) {
        next(error);
    }
});

// 8. 그룹 공개 여부 확인
groupRouter.get("/:groupId/is-public", async (req, res, next) => {
    try {
        const group = await prisma.group.findUnique({
            where: { groupId: parseInt(req.params.groupId) },
            select: { isPublic: true },
        });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));

        res.status(200).json(createResponse("success", "그룹 공개 여부 조회 성공", group));
    } catch (error) {
        next(error);
    }
});

// 9. 비밀번호 검증
groupRouter.post("/:groupId/verify-password", async (req, res, next) => {
    try {
        const groupId = parseInt(req.params.groupId);
        const { password } = req.body;

        const group = await prisma.group.findUnique({ where: { groupId } });

        if (!group) return res.status(404).json(createResponse("not_found", "존재하지 않는 그룹입니다.", {}));
        if (group.groupPassword !== password) return res.status(403).json(createResponse("unauthorized", "비밀번호가 틀렸습니다.", {}));

        res.status(200).json(createResponse("success", "비밀번호가 확인되었습니다.", {}));
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
